import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import {
  AuditTrail,
  CleaningRecord,
  Incident,
  Location,
  SupervisorAudit,
} from '../../entities';
import {
  CreateLocationDto,
  UpdateLocationDto,
  UpdateScheduleDto,
} from '../../dto';
import { SlaService } from '../sla/sla.service';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location)
    private readonly locationsRepo: Repository<Location>,
    @InjectRepository(CleaningRecord)
    private readonly cleaningsRepo: Repository<CleaningRecord>,
    @InjectRepository(SupervisorAudit)
    private readonly auditsRepo: Repository<SupervisorAudit>,
    @InjectRepository(Incident)
    private readonly incidentsRepo: Repository<Incident>,
    @InjectRepository(AuditTrail)
    private readonly auditTrailRepo: Repository<AuditTrail>,
    private readonly slaService: SlaService,
  ) {}

  async requireLocation(id: string): Promise<Location> {
    const location = await this.locationsRepo.findOne({ where: { id } });
    if (!location) throw new NotFoundException('WC / Mahal kaydı bulunamadı.');
    return location;
  }

  async listLocations(isAdmin: boolean) {
    const items = await this.locationsRepo.find({
      order: { name: 'ASC' },
    });

    if (isAdmin) {
      return items;
    }

    // Proof-of-Presence güvenliği: Token gizlenerek fiziki QR okutma zorunluluğu sağlanır
    return items.map((loc) => ({
      ...loc,
      token: null,
    }));
  }

  async getLocationQrToken(id: string) {
    const loc = await this.requireLocation(id);
    return { id: loc.id, token: loc.token, code: loc.code, name: loc.name };
  }

  async resolveByToken(token: string) {
    const location = await this.locationsRepo.findOne({ where: { token } });
    if (!location) throw new NotFoundException('Geçersiz veya iptal edilmiş QR kod.');

    const [lastCleaning, recentLogs] = await Promise.all([
      this.cleaningsRepo.findOne({
        where: { locationId: location.id },
        order: { createdAt: 'DESC' },
      }),
      this.cleaningsRepo.find({
        where: { locationId: location.id },
        order: { createdAt: 'ASC' },
        take: 50,
      }),
    ]);

    const startOfToday = this.slaService.getStartOfTodayIstanbul();
    const todayLogs = recentLogs.filter((log) => new Date(log.createdAt) >= startOfToday);

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

  async getPublicStatus(id: string) {
    const location = await this.requireLocation(id);
    const [lastCleaning, recentLogs] = await Promise.all([
      this.cleaningsRepo.findOne({
        where: { locationId: location.id },
        order: { createdAt: 'DESC' },
      }),
      this.cleaningsRepo.find({
        where: { locationId: location.id },
        order: { createdAt: 'ASC' },
        take: 50,
      }),
    ]);

    const startOfToday = this.slaService.getStartOfTodayIstanbul();
    const todayLogs = recentLogs.filter((log) => new Date(log.createdAt) >= startOfToday);

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

  async getSupervisorStatus(id: string) {
    const location = await this.requireLocation(id);
    const [lastCleaning, lastAudit, activeIncidents, cleanings] = await Promise.all([
      this.cleaningsRepo.findOne({
        where: { locationId: location.id },
        order: { createdAt: 'DESC' },
      }),
      this.auditsRepo.findOne({
        where: { locationId: location.id },
        order: { createdAt: 'DESC' },
      }),
      this.incidentsRepo.find({
        where: { locationId: location.id },
        order: { createdAt: 'DESC' },
      }),
      this.cleaningsRepo.find({
        where: { locationId: location.id },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
    ]);

    const startOfToday = this.slaService.getStartOfTodayIstanbul();
    const todayCleanings = cleanings.filter((c) => new Date(c.createdAt) >= startOfToday);

    const dailyScheduleStatus = this.slaService.evaluateDailySchedule(
      location.schedule,
      todayCleanings,
      location.toleranceMinutes,
    );

    return {
      location,
      lastCleaning,
      lastAudit,
      activeIncidents: activeIncidents.filter((i) => i.status !== 'VERIFIED_CLOSED'),
      recentCleanings: cleanings,
      dailyScheduleStatus,
    };
  }

  async createLocation(body: CreateLocationDto, actorName: string): Promise<Location> {
    const id = randomUUID();
    const token = `token-wc-${randomBytes(8).toString('hex')}`;
    const code = body.code?.trim() || `PRJ-A-WC-${Math.floor(100 + Math.random() * 900)}`;

    const location = await this.locationsRepo.save({
      id,
      code,
      name: body.name.trim(),
      building: body.building?.trim() || 'Ana Bina',
      token,
      toleranceMinutes: body.toleranceMinutes || 15,
      schedule:
        body.schedule && body.schedule.length > 0
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
      actorName || 'Yönetici',
      `Yeni WC mahali oluşturuldu: ${location.name} (${location.code})`,
    );

    return location;
  }

  async updateLocation(id: string, body: UpdateLocationDto, actorName: string): Promise<Location> {
    const location = await this.requireLocation(id);
    if (body.name) location.name = body.name.trim();
    if (body.code) location.code = body.code.trim();
    if (body.building) location.building = body.building.trim();
    if (body.toleranceMinutes) location.toleranceMinutes = body.toleranceMinutes;
    if (body.schedule) location.schedule = [...body.schedule].sort();
    if (body.currentSupervisorName) location.currentSupervisorName = body.currentSupervisorName;
    if (body.backupSupervisorName) location.backupSupervisorName = body.backupSupervisorName;
    if (body.status) location.status = body.status;

    await this.locationsRepo.save(location);

    await this.addAudit(
      location.id,
      'MAHAL_GUNCELLEME',
      actorName || 'Yönetici',
      `WC mahali güncellendi: ${location.name} (${location.status})`,
    );

    return location;
  }

  async updateSchedule(id: string, body: UpdateScheduleDto, actorName: string): Promise<Location> {
    const location = await this.requireLocation(id);
    location.schedule = [...body.schedule].sort();
    location.toleranceMinutes = body.toleranceMinutes;
    await this.locationsRepo.save(location);

    await this.addAudit(
      location.id,
      'PLAN_GUNCELLEME',
      actorName || location.currentSupervisorName || 'Şef',
      `Temizlik saatleri ve tolerans (±${location.toleranceMinutes} dk) güncellendi.`,
    );

    return location;
  }

  async regenerateToken(id: string, actorName: string): Promise<{ success: boolean; location: Location; newToken: string }> {
    const location = await this.requireLocation(id);
    const oldToken = location.token;
    const newToken = `token-wc-${randomBytes(8).toString('hex')}`;
    location.token = newToken;
    await this.locationsRepo.save(location);

    await this.addAudit(
      location.id,
      'QR_TOKEN_YENILEME',
      actorName || 'Yönetici',
      `Eski QR token (${oldToken}) iptal edildi, yeni güvenli token üretildi.`,
    );

    return { success: true, location, newToken };
  }

  async deleteLocation(id: string, actorName: string): Promise<{ success: boolean; message: string }> {
    const location = await this.requireLocation(id);
    await this.locationsRepo.delete({ id });

    await this.addAudit(
      null,
      'MAHAL_SILME',
      actorName || 'Yönetici',
      `WC mahali silindi: ${location.name} (${location.code})`,
    );

    return { success: true, message: 'Mahal silindi.' };
  }

  async addAudit(
    locationId: string | null,
    action: string,
    userRole: string,
    summary: string,
  ): Promise<void> {
    try {
      await this.auditTrailRepo.save({
        id: randomUUID(),
        timestamp: this.slaService.getCurrentTimeStr(),
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
