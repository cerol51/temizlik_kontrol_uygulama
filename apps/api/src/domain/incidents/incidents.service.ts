import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { Request } from 'express';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../auth';
import {
  CreateCleaningRecordDto,
  CreateSupervisorAuditDto,
  CreateSurveyFeedbackDto,
  DispatchIncidentDto,
  StaffResolveIncidentDto,
  VerifyCloseIncidentDto,
} from '../../dto';
import {
  AppUser,
  AuditTrail,
  CleaningRecord,
  Incident,
  Location,
  SupervisorAudit,
  SurveyFeedback,
} from '../../entities';
import { NotificationsService } from '../../notifications.service';
import { SlaService } from '../sla/sla.service';
import { MediaService } from '../../media/media.service';

@Injectable()
export class IncidentsService implements OnModuleDestroy {
  private readonly escalationTimer: NodeJS.Timeout;

  constructor(
    @InjectRepository(Incident)
    private readonly incidentsRepo: Repository<Incident>,
    @InjectRepository(Location)
    private readonly locationsRepo: Repository<Location>,
    @InjectRepository(CleaningRecord)
    private readonly cleaningsRepo: Repository<CleaningRecord>,
    @InjectRepository(SupervisorAudit)
    private readonly auditsRepo: Repository<SupervisorAudit>,
    @InjectRepository(SurveyFeedback)
    private readonly surveysRepo: Repository<SurveyFeedback>,
    @InjectRepository(AppUser)
    private readonly usersRepo: Repository<AppUser>,
    @InjectRepository(AuditTrail)
    private readonly auditTrailRepo: Repository<AuditTrail>,
    private readonly notificationsService: NotificationsService,
    private readonly slaService: SlaService,
    private readonly mediaService: MediaService,
    private readonly dataSource: DataSource,
  ) {
    // 10 saniyede bir otomatik eskalasyon kontrolü (2 dakika kuralı)
    this.escalationTimer = setInterval(() => this.checkAutoEscalations(), 10000);
  }

  onModuleDestroy(): void {
    clearInterval(this.escalationTimer);
  }

  async getIncidents(locationId?: string, includeClosed?: string) {
    const qb = this.incidentsRepo.createQueryBuilder('i').orderBy('i.createdAt', 'DESC');
    if (includeClosed !== 'true') {
      qb.andWhere('i.status != :closed', { closed: 'VERIFIED_CLOSED' });
    }
    if (locationId) {
      qb.andWhere('i.locationId = :locationId', { locationId });
    }
    const list = await qb.getMany();
    const locations = await this.locationsRepo.find();
    const locMap = new Map(locations.map((l) => [l.id, l]));
    return list.map((inc) => ({
      ...inc,
      locationName: locMap.get(inc.locationId)?.name || inc.locationId,
      locationCode: locMap.get(inc.locationId)?.code || '',
    }));
  }

  async createCleaning(
    locationId: string,
    body: CreateCleaningRecordDto,
    user: AuthenticatedUser,
  ) {
    const location = await this.locationsRepo.findOne({ where: { id: locationId } });
    if (!location) throw new NotFoundException('WC / Mahal kaydı bulunamadı.');

    // P1-1: Proof-of-Presence (Fiziki Varlık Doğrulaması)
    const isVerifiedQr = !!(body.locationToken && body.locationToken === location.token);
    if (body.locationToken && !isVerifiedQr) {
      throw new BadRequestException('Fiziki varlık doğrulaması başarısız: Geçersiz veya süresi dolmuş QR kod tokenı.');
    }

    // Idempotency: Ağ tekrarı veya çifte tıklamada mükerrer kayıt oluşmasını engelle
    if (body.idempotencyKey) {
      const existingRecord = await this.cleaningsRepo.findOne({
        where: { idempotencyKey: body.idempotencyKey },
      });
      if (existingRecord) {
        return {
          record: existingRecord,
          duplicatePrevented: true,
          message: 'İşlem zaten işlendi (Idempotent replay).',
        };
      }
    }

    const actualTime = this.slaService.getCurrentTimeStr();
    const sla = this.slaService.evaluateSLA(location.schedule, actualTime, location.toleranceMinutes);
    const staffName = body.staffName?.trim() || user.name || 'Personel';
    const recordId = randomUUID();

    return await this.dataSource.transaction(async (manager) => {
      const record = await manager.save(CleaningRecord, {
        id: recordId,
        idempotencyKey: body.idempotencyKey || null,
        locationId: location.id,
        staffUserId: user.id || 'worker-01',
        staffName,
        plannedSlot: sla.targetSlot,
        actualTime,
        slaStatus: sla.status,
        diffMinutes: sla.diff,
        tasksConfirmed: body.tasksConfirmed ?? true,
        isVerifiedQr,
        note: body.note?.trim() || null,
      });

      // Açık veya atanmış bir olay varsa, temizlikle çözüldü aşamasına geçir
      const openIncident = await manager.findOne(Incident, {
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
        await manager.save(Incident, openIncident);
      }

      await manager.save(AuditTrail, {
        id: randomUUID(),
        timestamp: actualTime,
        locationId: location.id,
        action: 'TEMIZLIK_BEYANI',
        userRole: `Personel (${staffName})`,
        summary: isVerifiedQr
          ? `Periyodik temizlik tamamlandı (Fiziki QR Doğrulamalı). SLA: ${sla.label} (Hedef: ${sla.targetSlot})`
          : `Periyodik temizlik tamamlandı (Manuel/Uzaktan Beyan, QR okutulmadı). SLA: ${sla.label} (Hedef: ${sla.targetSlot})`,
      });

      return {
        record,
        sla,
      };
    });
  }

  async createAudit(
    locationId: string,
    body: CreateSupervisorAuditDto,
    user: AuthenticatedUser,
  ) {
    const location = await this.locationsRepo.findOne({ where: { id: locationId } });
    if (!location) throw new NotFoundException('WC / Mahal kaydı bulunamadı.');

    const supervisorName = user.name || location.currentSupervisorName || 'Kemal Şef';

    // P1-1: Proof-of-Presence (Fiziki Varlık Doğrulaması)
    const isVerifiedQr = !!(body.locationToken && body.locationToken === location.token);
    if (body.locationToken && !isVerifiedQr) {
      throw new BadRequestException('Fiziki varlık doğrulaması başarısız: Geçersiz veya süresi dolmuş QR kod tokenı.');
    }

    const currentTime = this.slaService.getCurrentTimeStr();

    const { audit, correctiveIncident, notificationToDispatch } = await this.dataSource.transaction(async (manager) => {
      let notificationInfo: {
        incidentId: string;
        locationName: string;
        issues: string[];
        targetSupervisor: string;
      } | null = null;

      const audit = await manager.save(SupervisorAudit, {
        id: randomUUID(),
        locationId: location.id,
        supervisorId: user.id || 'sup-01',
        supervisorName,
        templateVersion: body.templateVersion || 'v1.2',
        isApproved: body.isApproved,
        isVerifiedQr,
        checklistJson: body.checklist,
        note: body.note?.trim() || (body.isApproved ? 'Eksiksiz onaylandı.' : 'Uygunsuzluk tespit edildi.'),
      });

      let correctiveIncident: Incident | null = null;
      if (!body.isApproved) {
        const DEFAULT_CHECKLIST_LABELS = [
          'Ayna ve Lavabolar Lekesiz',
          'Klozet ve Pisuvarlar Hijyenik',
          'Zemin Kuru ve Temiz',
          'Sabun / Kağıt Havlu Dolu',
          'Koku Durumu Ferah',
          'Çöp Kovası Boş ve Poşetli',
        ];

        const failedItems: string[] = [];
        if (Array.isArray(body.checklist)) {
          body.checklist.forEach((item: any, idx: number) => {
            if (item && typeof item === 'object') {
              if (item.isOk === false) {
                failedItems.push(item.label || DEFAULT_CHECKLIST_LABELS[idx] || `Madde ${item.id || idx + 1}`);
              }
            } else if (item === false) {
              failedItems.push(DEFAULT_CHECKLIST_LABELS[idx] || `Madde ${idx + 1}`);
            }
          });
        } else if (body.checklist && typeof body.checklist === 'object') {
          Object.entries(body.checklist).forEach(([key, val]) => {
            if (val === false) {
              const numKey = Number(key);
              const label = !isNaN(numKey) && DEFAULT_CHECKLIST_LABELS[numKey]
                ? DEFAULT_CHECKLIST_LABELS[numKey]
                : key;
              failedItems.push(label);
            }
          });
        }

        const issues = failedItems.length > 0
          ? failedItems.map((f) => `❌ ${f}`)
          : ['⚠️ Şef Denetimi Uygunsuzluğu: ' + (body.note?.trim() || 'Genel uygunsuzluk')];

        const lastCleaning = await manager.findOne(CleaningRecord, {
          where: { locationId: location.id },
          order: { createdAt: 'DESC' },
        });

        let assignedStaffId: string | null = null;
        let assignedStaffName = 'Ahmet Temizlik';

        if (lastCleaning && lastCleaning.staffUserId) {
          assignedStaffId = lastCleaning.staffUserId;
          assignedStaffName = lastCleaning.staffName;
        } else {
          const defaultStaff = await manager.findOne(AppUser, {
            where: { role: 'employee' },
            order: { createdAt: 'ASC' },
          });
          if (defaultStaff) {
            assignedStaffId = defaultStaff.id;
            assignedStaffName = defaultStaff.fullName || defaultStaff.username;
          }
        }

        const incidentId = this.slaService.generateIncidentId();
        correctiveIncident = await manager.save(Incident, {
          id: incidentId,
          locationId: location.id,
          status: 'DISPATCHED',
          issuesJson: issues,
          signalCount: 1,
          assignedStaffId,
          assignedStaffName,
          currentSupId: location.currentSupervisorId,
          currentSupName: location.currentSupervisorName,
          backupSupId: location.backupSupervisorId,
          backupSupName: location.backupSupervisorName,
          isEscalated: false,
          time: currentTime,
          resolutionNote: body.note ? `Şef Notu: ${body.note}` : undefined,
        });

        notificationInfo = {
          incidentId,
          locationName: location.name,
          issues,
          targetSupervisor: location.currentSupervisorName || supervisorName,
        };
      }

      await manager.save(AuditTrail, {
        id: randomUUID(),
        timestamp: currentTime,
        locationId: location.id,
        action: 'SEF_DENETIMI',
        userRole: supervisorName,
        summary: body.isApproved
          ? 'Denetim eksiksiz onaylandı.'
          : `Uygunsuzluk tespit edildi ve düzeltme görevi (${correctiveIncident?.id}) ${correctiveIncident?.assignedStaffName} personeline otomatik iletildi.`,
      });

      return { audit, correctiveIncident, notificationToDispatch: notificationInfo };
    });

    if (notificationToDispatch) {
      await this.notificationsService.dispatchIncidentAlert(
        notificationToDispatch.incidentId,
        notificationToDispatch.locationName,
        notificationToDispatch.issues,
        notificationToDispatch.targetSupervisor,
      );
    }

    return { audit, correctiveIncident };
  }

  async createSurvey(body: CreateSurveyFeedbackDto, req: Request) {
    const location = await this.locationsRepo.findOne({ where: { id: body.locationId } });
    if (!location) throw new NotFoundException('WC / Mahal kaydı bulunamadı.');
    const currentTime = this.slaService.getCurrentTimeStr();

    let ratingStr = body.rating;
    if (ratingStr === '5' || ratingStr === '4') ratingStr = 'good';
    else if (ratingStr === '3') ratingStr = 'fair';
    else if (ratingStr === '1' || ratingStr === '2') ratingStr = 'bad';

    const isTrustProxy = process.env.TRUST_PROXY === 'true';
    const ip = (isTrustProxy ? req.ip : req.socket?.remoteAddress) || '127.0.0.1';
    const ua = req.headers['user-agent'] || 'unknown-ua';
    const dayStr = new Date().toISOString().substring(0, 10);
    const serverFingerprint = createHash('sha256')
      .update(`${ip}|${ua}|${dayStr}|wc-survey-salt`)
      .digest('hex')
      .substring(0, 32);

    const clientHash = body.clientHash
      ? `${serverFingerprint}_${body.clientHash.substring(0, 16)}`
      : serverFingerprint;

    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000);
    const recentFromClient = await this.surveysRepo.findOne({
      where: {
        locationId: location.id,
        clientHash,
      },
      order: { createdAt: 'DESC' },
    });

    if (recentFromClient && recentFromClient.createdAt > threeMinAgo) {
      throw new BadRequestException('Bu alan için kısa süre önce oy kullandınız. Lütfen birkaç dakika sonra tekrar deneyiniz.');
    }

    const issues = [...(body.issues || [])];
    const userNote = (body.note || body.comment)?.trim();
    if (userNote) {
      issues.push(`Yorum: "${userNote}"`);
    }

    const { survey, alertToDispatch } = await this.dataSource.transaction(async (manager) => {
      let alertInfo: {
        incidentId: string;
        locationName: string;
        issues: string[];
        supervisorName: string;
      } | null = null;

      const savedSurvey = await manager.save(SurveyFeedback, {
        id: randomUUID(),
        locationId: location.id,
        rating: ratingStr,
        issuesJson: issues,
        clientHash,
        time: currentTime,
      });

      if (ratingStr === 'bad') {
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
        const candidateIncident = await manager.findOne(Incident, {
          where: [
            { locationId: location.id, status: 'OPEN' },
            { locationId: location.id, status: 'DISPATCHED' },
            { locationId: location.id, status: 'ESCALATED' },
          ],
          order: { createdAt: 'DESC' },
        });

        const openIncident =
          candidateIncident &&
          (candidateIncident.status === 'OPEN' ||
            candidateIncident.status === 'ESCALATED' ||
            new Date(candidateIncident.createdAt) >= fifteenMinAgo)
            ? candidateIncident
            : null;

        if (openIncident) {
          openIncident.signalCount += 1;
          const mergedIssues = Array.from(new Set([...(openIncident.issuesJson || []), ...issues]));
          openIncident.issuesJson = mergedIssues;
          await manager.save(Incident, openIncident);
        } else {
          const incidentId = this.slaService.generateIncidentId();
          const newIncident = await manager.save(Incident, {
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

          alertInfo = {
            incidentId,
            locationName: location.name,
            issues: newIncident.issuesJson,
            supervisorName: location.currentSupervisorName || 'Nöbetçi Şef',
          };
        }

        await manager.save(AuditTrail, {
          id: randomUUID(),
          timestamp: currentTime,
          locationId: location.id,
          action: 'KOTU_ANKET_OLAY',
          userRole: 'Misafir (Anonim)',
          summary: `Şikayet iletildi: ${issues.join(', ') || 'Kötü Deneyim'}`,
        });
      } else {
        await manager.save(AuditTrail, {
          id: randomUUID(),
          timestamp: currentTime,
          locationId: location.id,
          action: 'ANKET_GIRIS',
          userRole: 'Misafir (Anonim)',
          summary: `Olumlu anket girişi: ${ratingStr === 'good' ? 'İyi' : 'Orta'}`,
        });
      }

      return { survey: savedSurvey, alertToDispatch: alertInfo };
    });

    if (alertToDispatch) {
      await this.notificationsService.dispatchIncidentAlert(
        alertToDispatch.incidentId,
        alertToDispatch.locationName,
        alertToDispatch.issues,
        alertToDispatch.supervisorName,
      );
    }

    return { id: survey.id, success: true };
  }

  async dispatch(incidentId: string, body: DispatchIncidentDto, user: AuthenticatedUser) {
    return await this.dataSource.transaction(async (manager) => {
      const incident = await manager.findOne(Incident, { where: { id: incidentId } });
      if (!incident) throw new NotFoundException('Olay kaydı bulunamadı.');
      if (incident.status === 'VERIFIED_CLOSED') {
        throw new BadRequestException('Kapatılmış (VERIFIED_CLOSED) bir olay tekrar atanamaz.');
      }

      incident.status = 'DISPATCHED';
      incident.assignedStaffName = body.assignedStaffName;

      if (body.assignedStaffId && body.assignedStaffId !== 'staff-assigned') {
        incident.assignedStaffId = body.assignedStaffId;
      } else {
        const staffUser = await manager.findOne(AppUser, {
          where: [
            { fullName: body.assignedStaffName },
            { username: body.assignedStaffName },
          ],
        });
        incident.assignedStaffId = staffUser?.id || null;
      }

      await manager.save(Incident, incident);

      await manager.save(AuditTrail, {
        id: randomUUID(),
        timestamp: this.slaService.getCurrentTimeStr(),
        locationId: incident.locationId,
        action: 'GOREV_ATANDI',
        userRole: user.name || incident.currentSupName || 'Şef',
        summary: `${incident.id} nolu şikayet ${incident.assignedStaffName} personeline atandı.`,
      });

      return incident;
    });
  }

  async staffResolve(incidentId: string, body: StaffResolveIncidentDto, user: AuthenticatedUser) {
    return await this.dataSource.transaction(async (manager) => {
      const incident = await manager.findOne(Incident, { where: { id: incidentId } });
      if (!incident) throw new NotFoundException('Olay kaydı bulunamadı.');
      if (incident.status === 'VERIFIED_CLOSED') {
        throw new BadRequestException('Kapatılmış (VERIFIED_CLOSED) bir olay üzerinde işlem yapılamaz.');
      }

      const currentTime = this.slaService.getCurrentTimeStr();
      incident.status = 'RESOLVED_BY_STAFF';
      incident.resolvedAt = currentTime;
      incident.resolvedAtUtc = new Date();
      incident.resolutionNote = body.note || 'Sarf malzemeleri ikmal edildi, dezenfeksiyon yapıldı.';
      if (body.photoUrl) {
        incident.photoUrl = await this.mediaService.saveBase64Image(body.photoUrl);
      }
      incident.assignedStaffName = body.staffName || incident.assignedStaffName || user.name || 'Personel';

      await manager.save(Incident, incident);

      await manager.save(AuditTrail, {
        id: randomUUID(),
        timestamp: currentTime,
        locationId: incident.locationId,
        action: 'PERSONEL_MUDAHALE',
        userRole: incident.assignedStaffName || user.name || 'Personel',
        summary: `${incident.id} nolu şikayete müdahale edildi ve şefe iletildi.`,
      });

      return incident;
    });
  }

  async verifyAndClose(incidentId: string, body: VerifyCloseIncidentDto, user: AuthenticatedUser) {
    return await this.dataSource.transaction(async (manager) => {
      const incident = await manager.findOne(Incident, { where: { id: incidentId } });
      if (!incident) throw new NotFoundException('Olay kaydı bulunamadı.');
      if (incident.status === 'VERIFIED_CLOSED') {
        throw new BadRequestException('Bu olay zaten doğrulanarak kapatılmış.');
      }

      incident.status = 'VERIFIED_CLOSED';
      if (!incident.resolvedAtUtc) {
        incident.resolvedAtUtc = new Date();
        incident.resolvedAt = this.slaService.getCurrentTimeStr();
      }
      if (body.note) incident.resolutionNote = body.note;
      await manager.save(Incident, incident);

      await manager.save(AuditTrail, {
        id: randomUUID(),
        timestamp: this.slaService.getCurrentTimeStr(),
        locationId: incident.locationId,
        action: 'OLAY_KAPATILDI',
        userRole: user.name || incident.currentSupName || 'Şef',
        summary: `${incident.id} nolu şikayet denetlenerek başarıyla kapatıldı.`,
      });

      return incident;
    });
  }

  async checkAutoEscalations(): Promise<number> {
    try {
      const now = Date.now();
      const twoMinutesAgo = new Date(now - 2 * 60 * 1000);
      const sevenMinutesAgo = new Date(now - 7 * 60 * 1000);
      const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000);

      let escalatedCount = 0;

      // -----------------------------------------------------------------------
      // 1. Kademe Eskalasyon: 2 dakika içinde nöbetçi şef tarafından atanmayan arızalar -> Yedek Şefe devir
      // -----------------------------------------------------------------------
      const openIncidents = await this.incidentsRepo.find({
        where: { status: 'OPEN', isEscalated: false },
        take: 50,
      });

      for (const inc of openIncidents) {
        if (inc.createdAt < twoMinutesAgo) {
          const nextSupName = inc.backupSupName || inc.currentSupName;
          const updateResult = await this.incidentsRepo.update(
            { id: inc.id, status: 'OPEN', isEscalated: false },
            { isEscalated: true, status: 'ESCALATED', currentSupName: nextSupName },
          );

          if (updateResult.affected && updateResult.affected > 0) {
            escalatedCount++;
            const loc = inc.locationId ? await this.locationsRepo.findOne({ where: { id: inc.locationId } }) : null;
            const locationName = loc?.name || 'Mahal';

            await this.auditTrailRepo.save({
              id: randomUUID(),
              timestamp: this.slaService.getCurrentTimeStr(),
              locationId: inc.locationId,
              action: 'ESKALASYON_KADEME_1',
              userRole: 'Sistem Otopilot',
              summary: `${inc.id} nolu şikayet (${locationName}) 2 dakika yanıtlanmadığı için YEDEK ŞEFE (${nextSupName}) devredildi!`,
            });

            await this.notificationsService.dispatchIncidentAlert(
              inc.id,
              locationName,
              inc.issuesJson,
              nextSupName || 'Yedek Şef',
              true,
            );
          }
        }
      }

      // -----------------------------------------------------------------------
      // 2. Kademe Eskalasyon (A): Personele atanıp 15 dakikadır çözülmeyen arızalar -> Tesis Direktörü Alarmı
      // -----------------------------------------------------------------------
      const dispatchedIncidents = await this.incidentsRepo.find({
        where: { status: 'DISPATCHED', isTier2Escalated: false },
        take: 50,
      });

      for (const inc of dispatchedIncidents) {
        if (inc.createdAt < fifteenMinutesAgo) {
          const updateResult = await this.incidentsRepo.update(
            { id: inc.id, status: 'DISPATCHED', isTier2Escalated: false },
            { isTier2Escalated: true },
          );

          if (updateResult.affected && updateResult.affected > 0) {
            escalatedCount++;
            const loc = inc.locationId ? await this.locationsRepo.findOne({ where: { id: inc.locationId } }) : null;
            const locationName = loc?.name || 'Mahal';

            await this.auditTrailRepo.save({
              id: randomUUID(),
              timestamp: this.slaService.getCurrentTimeStr(),
              locationId: inc.locationId,
              action: 'ESKALASYON_KADEME_2',
              userRole: 'Sistem Otopilot',
              summary: `🚨 KADEME-2 ESKALASYON: ${inc.id} nolu arıza personele (${inc.assignedStaffName || 'Atanan Personel'}) devredilmesine rağmen 15 dakikadır çözülmedi! Tesis Direktörü bilgilendirildi.`,
            });

            await this.notificationsService.dispatchIncidentAlert(
              inc.id,
              locationName,
              [`🚨 KADEME-2 SLA AŞIMI: Personel (${inc.assignedStaffName}) 15 dk müdahale etmedi!`, ...inc.issuesJson],
              'Tesis Direktörü / Genel Yönetim',
              true,
            );
          }
        }
      }

      // -----------------------------------------------------------------------
      // 2. Kademe Eskalasyon (B): Yedek şefe devredildiği halde 5 dk daha (toplam 7 dk) atanmayan arızalar
      // -----------------------------------------------------------------------
      const untouchedEscalated = await this.incidentsRepo.find({
        where: { status: 'ESCALATED', isTier2Escalated: false },
        take: 50,
      });

      for (const inc of untouchedEscalated) {
        if (inc.createdAt < sevenMinutesAgo) {
          const updateResult = await this.incidentsRepo.update(
            { id: inc.id, status: 'ESCALATED', isTier2Escalated: false },
            { isTier2Escalated: true },
          );

          if (updateResult.affected && updateResult.affected > 0) {
            escalatedCount++;
            const loc = inc.locationId ? await this.locationsRepo.findOne({ where: { id: inc.locationId } }) : null;
            const locationName = loc?.name || 'Mahal';

            await this.auditTrailRepo.save({
              id: randomUUID(),
              timestamp: this.slaService.getCurrentTimeStr(),
              locationId: inc.locationId,
              action: 'ESKALASYON_KADEME_2',
              userRole: 'Sistem Otopilot',
              summary: `🚨 KADEME-2 ESKALASYON: ${inc.id} nolu arıza yedek şef tarafından da 5 dakikadır atanmadı!`,
            });

            await this.notificationsService.dispatchIncidentAlert(
              inc.id,
              locationName,
              [`🚨 KADEME-2 UYARISI: Yedek şef de arızaya müdahale etmedi!`, ...inc.issuesJson],
              'Tesis Direktörü / Genel Yönetim',
              true,
            );
          }
        }
      }

      return escalatedCount;
    } catch {
      return 0;
    }
  }
}
