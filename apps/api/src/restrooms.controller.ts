import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { AuthenticatedUser, JwtAuthGuard, Public, Roles, RolesGuard } from './auth';
import {
  AuditTrail,
  CleaningRecord,
  Incident,
  Location,
  SupervisorAudit,
  SurveyFeedback,
} from './entities';
import {
  CreateCleaningRecordDto,
  CreateLocationDto,
  CreateSupervisorAuditDto,
  CreateSurveyFeedbackDto,
  DispatchIncidentDto,
  StaffResolveIncidentDto,
  UpdateLocationDto,
  UpdateScheduleDto,
  VerifyCloseIncidentDto,
} from './dto';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from './user.decorator';

function getCurrentTimeStr(date = new Date()): string {
  return date.toTimeString().substring(0, 5);
}

function evaluateSLA(
  schedule: string[],
  actualTime: string,
  toleranceMinutes = 15,
): { status: string; label: string; badgeClass: string; diff: number; targetSlot: string } {
  if (!schedule || schedule.length === 0) {
    return {
      status: 'ON_TIME',
      label: 'Zamanında',
      badgeClass: 'badge-ontime',
      diff: 0,
      targetSlot: actualTime,
    };
  }

  const [aH, aM] = actualTime.split(':').map(Number);
  const actualTotal = aH * 60 + aM;

  let closest = schedule[0];
  let minDiff = 999999;
  let signedDiff = 0;

  for (const slot of schedule) {
    const [sH, sM] = slot.split(':').map(Number);
    const slotTotal = sH * 60 + sM;
    const diff = actualTotal - slotTotal;
    if (Math.abs(diff) < minDiff) {
      minDiff = Math.abs(diff);
      signedDiff = diff;
      closest = slot;
    }
  }

  if (minDiff === 0) {
    return {
      status: 'ON_TIME',
      label: 'Zamanında',
      badgeClass: 'badge-ontime',
      diff: 0,
      targetSlot: closest,
    };
  } else if (minDiff >= 1 && minDiff <= toleranceMinutes) {
    const signText = signedDiff > 0 ? `+${signedDiff} dk` : `${signedDiff} dk`;
    return {
      status: 'OUT_OF_TIME',
      label: `Plan Dışı (${signText})`,
      badgeClass: 'badge-outoftime',
      diff: signedDiff,
      targetSlot: closest,
    };
  } else {
    const signText = signedDiff > 0 ? `+${signedDiff} dk gecikme` : `${signedDiff} dk erken`;
    return {
      status: 'NOT_DONE',
      label: `Yapılmadı (${signText})`,
      badgeClass: 'badge-notdone',
      diff: signedDiff,
      targetSlot: closest,
    };
  }
}

@Controller()
export class RestroomsController {
  constructor(
    @InjectRepository(Location)
    private readonly locations: Repository<Location>,
    @InjectRepository(CleaningRecord)
    private readonly cleanings: Repository<CleaningRecord>,
    @InjectRepository(SupervisorAudit)
    private readonly audits: Repository<SupervisorAudit>,
    @InjectRepository(Incident)
    private readonly incidents: Repository<Incident>,
    @InjectRepository(SurveyFeedback)
    private readonly surveys: Repository<SurveyFeedback>,
    @InjectRepository(AuditTrail)
    private readonly auditTrail: Repository<AuditTrail>,
    private readonly notifications: NotificationsService,
  ) {
    // 10 saniyede bir otomatik eskalasyon kontrolü (2 dakika kuralı)
    setInterval(() => this.checkAutoEscalations(), 10000);
  }

  @Get('health')
  @Public()
  health(): { status: string; version: string } {
    return { status: 'ok', version: '2.0.0' };
  }

  // Tüm mahaller (Public listeleme / seçim)
  @Get(['locations', 'restrooms'])
  @Public()
  async listLocations() {
    return this.locations.find({
      order: { name: 'ASC' },
    });
  }

  // Opaque QR Token Çözümleme (Zero-Friction Routing)
  @Get('q/:token')
  @Public()
  async resolveByToken(@Param('token') token: string) {
    const location = await this.locations.findOne({ where: { token } });
    if (!location) throw new NotFoundException('Geçersiz veya iptal edilmiş QR kod.');

    const [lastCleaning, todayLogs] = await Promise.all([
      this.cleanings.findOne({
        where: { locationId: location.id },
        order: { createdAt: 'DESC' },
      }),
      this.cleanings.find({
        where: { locationId: location.id },
        order: { createdAt: 'ASC' },
        take: 20,
      }),
    ]);

    // KVKK Uyarınca: Ziyaretçiye çalışan adı veya şef denetim detayı sızdırılmaz
    return {
      location: {
        id: location.id,
        code: location.code,
        name: location.name,
        building: location.building,
        toleranceMinutes: location.toleranceMinutes,
        schedule: location.schedule,
        status: location.status,
      },
      lastCleaningTime: lastCleaning ? lastCleaning.actualTime : null,
      todayCleanings: todayLogs.map((log) => ({
        time: log.actualTime,
        targetSlot: log.plannedSlot,
      })),
    };
  }

  // Mahal Detay & Durum Bilgisi (Public / Misafir)
  @Get(['locations/:id/public', 'restrooms/:id/public'])
  @Public()
  async publicStatus(@Param('id') id: string) {
    const location = await this.requireLocation(id);
    const [lastCleaning, todayLogs] = await Promise.all([
      this.cleanings.findOne({
        where: { locationId: location.id },
        order: { createdAt: 'DESC' },
      }),
      this.cleanings.find({
        where: { locationId: location.id },
        order: { createdAt: 'ASC' },
        take: 20,
      }),
    ]);

    return {
      location: {
        id: location.id,
        code: location.code,
        name: location.name,
        building: location.building,
        toleranceMinutes: location.toleranceMinutes,
        schedule: location.schedule,
        status: location.status,
      },
      lastCleaningTime: lastCleaning ? lastCleaning.actualTime : null,
      todayCleanings: todayLogs.map((log) => ({
        time: log.actualTime,
        targetSlot: log.plannedSlot,
      })),
    };
  }

  // Mahal Detay & Yönetim Durumu (Şef ve Personel için)
  @Get(['locations/:id/supervisor', 'restrooms/:id/supervisor'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor', 'employee')
  async supervisorStatus(@Param('id') id: string) {
    const location = await this.requireLocation(id);
    const [lastCleaning, lastAudit, activeIncidents, cleanings] = await Promise.all([
      this.cleanings.findOne({
        where: { locationId: location.id },
        order: { createdAt: 'DESC' },
      }),
      this.audits.findOne({
        where: { locationId: location.id },
        order: { createdAt: 'DESC' },
      }),
      this.incidents.find({
        where: { locationId: location.id },
        order: { createdAt: 'DESC' },
      }),
      this.cleanings.find({
        where: { locationId: location.id },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
    ]);

    return {
      location,
      lastCleaning,
      lastAudit,
      activeIncidents: activeIncidents.filter((i) => i.status !== 'VERIFIED_CLOSED'),
      recentCleanings: cleanings,
    };
  }

  // 1. Personel Temizlik Beyanı Oluşturma
  @Post(['locations/:id/cleanings', 'restrooms/:id/cleanings'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('employee', 'supervisor')
  async createCleaning(
    @Param('id') locationId: string,
    @Body() body: CreateCleaningRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const location = await this.requireLocation(locationId);
    const actualTime = getCurrentTimeStr();
    const sla = evaluateSLA(location.schedule, actualTime, location.toleranceMinutes);

    const staffName = body.staffName?.trim() || user.name || 'Personel';

    const record = await this.cleanings.save({
      id: randomUUID(),
      locationId: location.id,
      staffUserId: user.id || 'worker-01',
      staffName,
      plannedSlot: sla.targetSlot,
      actualTime,
      slaStatus: sla.status,
      diffMinutes: sla.diff,
      tasksConfirmed: body.tasksConfirmed ?? true,
      note: body.note?.trim() || null,
    });

    // Açık veya atanmış bir olay varsa, temizlikle çözüldü aşamasına geçir
    const openIncident = await this.incidents.findOne({
      where: [
        { locationId: location.id, status: 'OPEN' },
        { locationId: location.id, status: 'DISPATCHED' },
      ],
    });

    if (openIncident) {
      openIncident.status = 'RESOLVED_BY_STAFF';
      openIncident.resolvedAt = actualTime;
      openIncident.resolvedAtUtc = new Date();
      openIncident.assignedStaffName = staffName;
      await this.incidents.save(openIncident);
    }

    await this.addAudit(
      location.id,
      'TEMIZLIK_BEYANI',
      `Personel (${staffName})`,
      `Periyodik temizlik tamamlandı. SLA: ${sla.label} (Hedef: ${sla.targetSlot})`,
    );

    return {
      record,
      sla,
    };
  }

  // 2. Şef Sürümlü Saha Denetimi (Checklist v1.2)
  @Post(['locations/:id/inspections', 'locations/:id/audits', 'restrooms/:id/inspections'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  async createAudit(
    @Param('id') locationId: string,
    @Body() body: CreateSupervisorAuditDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const location = await this.requireLocation(locationId);
    const supervisorName = user.name || location.currentSupervisorName || 'Kemal Şef';

    const audit = await this.audits.save({
      id: randomUUID(),
      locationId: location.id,
      supervisorId: user.id || 'sup-01',
      supervisorName,
      templateVersion: body.templateVersion || 'v1.2',
      isApproved: body.isApproved,
      checklistJson: body.checklist,
      note: body.note?.trim() || (body.isApproved ? 'Eksiksiz onaylandı.' : 'Uygunsuzluk tespit edildi.'),
    });

    // Eğer denetim onaylanmazsa (Uygunsuzluk), sistem OTOMATİK düzeltici olay üretir
    let correctiveIncident: Incident | null = null;
    if (!body.isApproved) {
      const incidentId = 'INC-' + Math.floor(1000 + Math.random() * 9000);
      correctiveIncident = await this.incidents.save({
        id: incidentId,
        locationId: location.id,
        status: 'OPEN',
        issuesJson: ['⚠️ Şef Denetimi Uygunsuzluğu'],
        signalCount: 1,
        currentSupId: location.currentSupervisorId,
        currentSupName: location.currentSupervisorName,
        backupSupId: location.backupSupervisorId,
        backupSupName: location.backupSupervisorName,
        isEscalated: false,
        time: getCurrentTimeStr(),
      });

      await this.notifications.dispatchIncidentAlert(
        incidentId,
        location.name,
        ['⚠️ Şef Denetimi Uygunsuzluğu'],
        location.currentSupervisorName || supervisorName,
      );
    }

    await this.addAudit(
      location.id,
      'SEF_DENETIMI',
      supervisorName,
      body.isApproved
        ? 'Denetim eksiksiz onaylandı.'
        : `Uygunsuzluk tespit edildi ve düzeltme bileti (${correctiveIncident?.id}) açıldı.`,
    );

    return { audit, correctiveIncident };
  }

  // 3. Ziyaretçi Memnuniyet Anketi (3 Emoji + Kök Neden + Korelasyon)
  @Post('surveys')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async createSurvey(@Body() body: CreateSurveyFeedbackDto, @Req() req: Request) {
    const location = await this.requireLocation(body.locationId);
    const currentTime = getCurrentTimeStr();

    // 1-5 puan gelirse emojiye normalize et
    let ratingStr = body.rating;
    if (ratingStr === '5' || ratingStr === '4') ratingStr = 'good';
    else if (ratingStr === '3') ratingStr = 'fair';
    else if (ratingStr === '1' || ratingStr === '2') ratingStr = 'bad';

    const clientHash = body.clientHash || req.ip || 'anonymous-client';

    // 3 dakikalık kötüye kullanım / mükerrer oy kontrolü
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000);
    const recentFromClient = await this.surveys.findOne({
      where: {
        locationId: location.id,
        clientHash,
      },
      order: { createdAt: 'DESC' },
    });

    if (recentFromClient && recentFromClient.createdAt > threeMinAgo) {
      throw new BadRequestException('Bu alan için kısa süre önce oy kullandınız. Lütfen birkaç dakika sonra tekrar deneyiniz.');
    }

    const issues = body.issues || [];
    const survey = await this.surveys.save({
      id: randomUUID(),
      locationId: location.id,
      rating: ratingStr,
      issuesJson: issues,
      clientHash,
      time: currentTime,
    });

    if (ratingStr === 'bad') {
      // 15 Dakikalık Korelasyon Kontrolü: Açık bir incident var mı?
      const openIncident = await this.incidents.findOne({
        where: [
          { locationId: location.id, status: 'OPEN' },
          { locationId: location.id, status: 'DISPATCHED' },
          { locationId: location.id, status: 'ESCALATED' },
        ],
      });

      if (openIncident) {
        // Mevcut açık olayın sinyal sayısını artır ve yeni sorunları birleştir
        openIncident.signalCount += 1;
        const mergedIssues = Array.from(new Set([...(openIncident.issuesJson || []), ...issues]));
        openIncident.issuesJson = mergedIssues;
        await this.incidents.save(openIncident);
      } else {
        // Yeni Incident oluştur
        const incidentId = 'INC-' + Math.floor(1000 + Math.random() * 9000);
        const newIncident = await this.incidents.save({
          id: incidentId,
          locationId: location.id,
          status: 'OPEN',
          issuesJson: issues.length > 0 ? issues : ['Genel Memnuniyetsizlik'],
          signalCount: 1,
          currentSupId: location.currentSupervisorId,
          currentSupName: location.currentSupervisorName,
          backupSupId: location.backupSupervisorId,
          backupSupName: location.backupSupervisorName,
          isEscalated: false,
          time: currentTime,
        });

        await this.notifications.dispatchIncidentAlert(
          incidentId,
          location.name,
          newIncident.issuesJson,
          location.currentSupervisorName || 'Nöbetçi Şef',
        );
      }

      await this.addAudit(
        location.id,
        'KOTU_ANKET_OLAY',
        'Misafir (Anonim)',
        `Şikayet iletildi: ${issues.join(', ') || 'Kötü Deneyim'}`,
      );
    } else {
      await this.addAudit(
        location.id,
        'ANKET_GIRIS',
        'Misafir (Anonim)',
        `Olumlu anket girişi: ${ratingStr === 'good' ? 'İyi' : 'Orta'}`,
      );
    }

    return { id: survey.id, success: true };
  }

  // 4. Şef Olay Görevlendirme (Dispatch)
  @Post('incidents/:id/dispatch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  async dispatchIncident(
    @Param('id') incidentId: string,
    @Body() body: DispatchIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const incident = await this.incidents.findOne({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException('Olay kaydı bulunamadı.');

    incident.status = 'DISPATCHED';
    incident.assignedStaffName = body.assignedStaffName;
    incident.assignedStaffId = body.assignedStaffId || 'staff-assigned';
    await this.incidents.save(incident);

    await this.addAudit(
      incident.locationId,
      'GOREV_ATANDI',
      user.name || incident.currentSupName || 'Şef',
      `${incident.id} nolu şikayet ${incident.assignedStaffName} personeline atandı.`,
    );

    return incident;
  }

  // 5. Personel Müdahaleyi Tamamlama
  @Post('incidents/:id/staff-resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('employee', 'supervisor')
  async staffResolve(
    @Param('id') incidentId: string,
    @Body() body: StaffResolveIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const incident = await this.incidents.findOne({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException('Olay kaydı bulunamadı.');

    const currentTime = getCurrentTimeStr();
    incident.status = 'RESOLVED_BY_STAFF';
    incident.resolvedAt = currentTime;
    incident.resolvedAtUtc = new Date();
    incident.resolutionNote = body.note || 'Sarf malzemeleri ikmal edildi, dezenfeksiyon yapıldı.';
    if (body.staffName) incident.assignedStaffName = body.staffName;

    await this.incidents.save(incident);

    await this.addAudit(
      incident.locationId,
      'PERSONEL_MUDAHALE',
      incident.assignedStaffName || user.name || 'Personel',
      `${incident.id} nolu şikayete müdahale edildi ve şefe iletildi.`,
    );

    return incident;
  }

  // 6. Şef Doğrulama ve Kapatma (Verify & Close)
  @Post('incidents/:id/verify-close')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  async verifyAndClose(
    @Param('id') incidentId: string,
    @Body() body: VerifyCloseIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const incident = await this.incidents.findOne({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException('Olay kaydı bulunamadı.');

    incident.status = 'VERIFIED_CLOSED';
    if (body.note) incident.resolutionNote = body.note;
    await this.incidents.save(incident);

    await this.addAudit(
      incident.locationId,
      'OLAY_KAPATILDI',
      user.name || incident.currentSupName || 'Şef',
      `${incident.id} nolu şikayet denetlenerek başarıyla kapatıldı.`,
    );

    return incident;
  }

  // 7. Plan ve Tolerans Güncelleme
  @Put('locations/:id/schedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  async updateSchedule(
    @Param('id') locationId: string,
    @Body() body: UpdateScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const location = await this.requireLocation(locationId);
    location.schedule = [...body.schedule].sort();
    location.toleranceMinutes = body.toleranceMinutes;
    await this.locations.save(location);

    await this.addAudit(
      location.id,
      'PLAN_GUNCELLEME',
      user.name || location.currentSupervisorName || 'Şef',
      `Temizlik saatleri ve tolerans (±${location.toleranceMinutes} dk) güncellendi.`,
    );

    return location;
  }

  // 8. Yeni WC Noktası Ekleme (Admin / Şef)
  @Post(['locations', 'restrooms'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  async createLocation(
    @Body() body: CreateLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const id = randomUUID();
    const token = 'token-wc-' + Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 6);
    const code = body.code?.trim() || `PRJ-A-WC-${Math.floor(100 + Math.random() * 900)}`;

    const location = await this.locations.save({
      id,
      code,
      name: body.name.trim(),
      building: body.building?.trim() || 'Ana Bina',
      token,
      toleranceMinutes: body.toleranceMinutes || 15,
      schedule: body.schedule && body.schedule.length > 0
        ? [...body.schedule].sort()
        : ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
      currentSupervisorId: 'SUP-01',
      currentSupervisorName: body.currentSupervisorName || 'Kemal Şef',
      backupSupervisorId: 'SUP-02',
      backupSupervisorName: body.backupSupervisorName || 'Ayşe Şef',
      status: 'ACTIVE',
    });

    await this.addAudit(
      location.id,
      'MAHAL_EKLEME',
      user.name || 'Yönetici',
      `Yeni WC mahali oluşturuldu: ${location.name} (${location.code})`,
    );

    return location;
  }

  // 9. WC Noktası Güncelleme
  @Put(['locations/:id/details', 'restrooms/:id/details'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  async updateLocation(
    @Param('id') id: string,
    @Body() body: UpdateLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const location = await this.requireLocation(id);
    if (body.name) location.name = body.name.trim();
    if (body.code) location.code = body.code.trim();
    if (body.building) location.building = body.building.trim();
    if (body.toleranceMinutes) location.toleranceMinutes = body.toleranceMinutes;
    if (body.schedule) location.schedule = [...body.schedule].sort();
    if (body.currentSupervisorName) location.currentSupervisorName = body.currentSupervisorName;
    if (body.backupSupervisorName) location.backupSupervisorName = body.backupSupervisorName;
    if (body.status) location.status = body.status;

    await this.locations.save(location);

    await this.addAudit(
      location.id,
      'MAHAL_GUNCELLEME',
      user.name || 'Yönetici',
      `WC mahali güncellendi: ${location.name} (${location.status})`,
    );

    return location;
  }

  // 10. QR Token Yenileme (Eski tokenı iptal et, yeni token ata - GAP-25)
  @Post(['locations/:id/regenerate-token', 'restrooms/:id/regenerate-token'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  async regenerateToken(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const location = await this.requireLocation(id);
    const oldToken = location.token;
    const newToken = 'token-wc-' + Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 6);
    location.token = newToken;
    await this.locations.save(location);

    await this.addAudit(
      location.id,
      'QR_TOKEN_YENILEME',
      user.name || 'Yönetici',
      `Eski QR token (${oldToken}) iptal edildi, yeni güvenli token üretildi.`,
    );

    return { success: true, location, newToken };
  }

  // 11. WC Noktası Silme / Arşivleme
  @Delete(['locations/:id', 'restrooms/:id'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  async deleteLocation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const location = await this.requireLocation(id);
    await this.locations.delete({ id });

    await this.addAudit(
      null,
      'MAHAL_SILME',
      user.name || 'Yönetici',
      `WC mahali silindi: ${location.name} (${location.code})`,
    );

    return { success: true, message: 'Mahal silindi.' };
  }


  // Otomatik Eskalasyon Kontrolörü (Background Worker: 2 dk)
  private async checkAutoEscalations(): Promise<void> {
    try {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const openIncidents = await this.incidents.find({
        where: { status: 'OPEN', isEscalated: false },
      });

      for (const inc of openIncidents) {
        if (inc.createdAt < twoMinutesAgo) {
          inc.isEscalated = true;
          inc.status = 'ESCALATED';
          if (inc.backupSupName) inc.currentSupName = inc.backupSupName;
          await this.incidents.save(inc);

          await this.addAudit(
            inc.locationId,
            'ESKALASYON',
            'Sistem Otopilot',
            `${inc.id} nolu şikayet 2 dakika yanıtlanmadığı için YEDEK ŞEFE (${inc.backupSupName || 'Yedek'}) devredildi!`,
          );

          await this.notifications.dispatchIncidentAlert(
            inc.id,
            'Mahal',
            inc.issuesJson,
            inc.backupSupName || 'Yedek Şef',
            true,
          );
        }
      }
    } catch {
      // Background worker logging
    }
  }

  private async requireLocation(id: string): Promise<Location> {
    const location = await this.locations.findOne({ where: { id } });
    if (!location) throw new NotFoundException('WC / Mahal kaydı bulunamadı.');
    return location;
  }

  private async addAudit(
    locationId: string | null,
    action: string,
    userRole: string,
    summary: string,
  ): Promise<void> {
    try {
      await this.auditTrail.save({
        id: randomUUID(),
        timestamp: getCurrentTimeStr(),
        locationId,
        action,
        userRole,
        summary,
      });
    } catch (e) {
      console.warn('Audit trail insert error:', e);
    }
  }
}
