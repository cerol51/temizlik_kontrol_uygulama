import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Response } from 'express';
import { MoreThanOrEqual, Not, Repository } from 'typeorm';
import { JwtAuthGuard, Roles, RolesGuard } from './auth';
import {
  AuditTrail,
  CleaningRecord,
  Incident,
  Location,
  SupervisorAudit,
  SurveyFeedback,
} from './entities';
import { evaluateDailySchedule, getStartOfTodayIstanbul } from './restrooms.controller';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('supervisor', 'admin')
export class ReportsController {
  constructor(
    @InjectRepository(Location)
    private readonly locations: Repository<Location>,
    @InjectRepository(CleaningRecord)
    private readonly cleanings: Repository<CleaningRecord>,
    @InjectRepository(SupervisorAudit)
    private readonly audits: Repository<SupervisorAudit>,
    @InjectRepository(SurveyFeedback)
    private readonly surveys: Repository<SurveyFeedback>,
    @InjectRepository(Incident)
    private readonly incidents: Repository<Incident>,
    @InjectRepository(AuditTrail)
    private readonly auditTrail: Repository<AuditTrail>,
  ) {}

  @Get('dashboard')
  async getDashboardData() {
    const startOfToday = getStartOfTodayIstanbul();

    // Veritabanı Optimizasyonu: Belleğe tüm tabloları çekmek (OOM çöküşü) yerine indeksli ve filtrelenmiş alt kümeler çekilir.
    const [locations, todayCleanings, todayAudits, todaySurveys, activeIncidents, closedIncidents, recentSurveysForPareto, auditLogs] = await Promise.all([
      this.locations.find({ order: { name: 'ASC' } }),
      this.cleanings.find({
        where: { createdAt: MoreThanOrEqual(startOfToday) },
        order: { createdAt: 'DESC' },
      }),
      this.audits.find({
        where: { createdAt: MoreThanOrEqual(startOfToday) },
        order: { createdAt: 'DESC' },
      }),
      this.surveys.find({
        where: { createdAt: MoreThanOrEqual(startOfToday) },
        order: { createdAt: 'DESC' },
      }),
      this.incidents.find({
        where: { status: Not('VERIFIED_CLOSED') },
        order: { createdAt: 'DESC' },
      }),
      this.incidents.find({
        where: { status: 'VERIFIED_CLOSED' },
        order: { createdAt: 'DESC' },
        take: 100,
      }),
      this.surveys.find({
        order: { createdAt: 'DESC' },
        take: 500,
      }),
      this.auditTrail.find({ order: { createdAt: 'DESC' }, take: 50 }),
    ]);
    const totalCleans = todayCleanings.length;
    let onTimeCount = 0;
    let outOfTimeCount = 0;
    let notDoneCount = 0;

    todayCleanings.forEach((c) => {
      if (c.slaStatus === 'ON_TIME') onTimeCount++;
      else if (c.slaStatus === 'OUT_OF_TIME' || c.slaStatus === 'EARLY') outOfTimeCount++;
      else if (c.slaStatus === 'NOT_DONE' || c.slaStatus === 'LATE' || c.slaStatus === 'MISSED') notDoneCount++;
    });

    const onTimeRate = totalCleans > 0 ? Math.round((onTimeCount / totalCleans) * 100) : 0;
    const outOfTimeRate = totalCleans > 0 ? Math.round((outOfTimeCount / totalCleans) * 100) : 0;
    const notDoneRate = totalCleans > 0 ? Math.round((notDoneCount / totalCleans) * 100) : 0;

    // 2. CSAT Hesaplaması (Bugünün anketleri üzerinden)
    const totalSurveys = todaySurveys.length;
    const goodSurveys = todaySurveys.filter(
      (s) => s.rating === 'good' || s.rating === '5' || s.rating === '4',
    ).length;
    const csatRate = totalSurveys > 0 ? Math.round((goodSurveys / totalSurveys) * 100) : 100;

    // 3. Ortalama Müdahale Süresi (MTTR - dakika)
    let totalResolutionMinutes = 0;
    closedIncidents.forEach((inc) => {
      if (inc.resolvedAtUtc) {
        const diffMs = inc.resolvedAtUtc.getTime() - inc.createdAt.getTime();
        totalResolutionMinutes += Math.max(1, Math.round(diffMs / 60000));
      }
    });
    const avgMTTR =
      closedIncidents.length > 0
        ? Math.round(totalResolutionMinutes / closedIncidents.length)
        : 8;

    // 4. Denetim Kapsama Oranı (Bugün denetlenen aktif mahaller)
    const auditedLocationIds = new Set(todayAudits.map((a) => a.locationId));
    const auditCoverageRate =
      locations.length > 0
        ? Math.min(100, Math.round((auditedLocationIds.size / locations.length) * 100))
        : 100;

    // 5. Pareto Analizi (Kök Nedenler - Son anketler üzerinden)
    const paretoCounts: Record<string, number> = {};
    recentSurveysForPareto.forEach((s) => {
      if (s.issuesJson && Array.isArray(s.issuesJson)) {
        s.issuesJson.forEach((issue) => {
          paretoCounts[issue] = (paretoCounts[issue] || 0) + 1;
        });
      }
    });

    const paretoData = Object.entries(paretoCounts)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count);

    // 6. Canlı Mahal Operasyon Matrisi ve Kaçırılan (MISSED) Slotlar
    let totalPlannedSlotsToday = 0;
    let totalMissedSlotsToday = 0;

    const locationMatrix = locations.map((loc) => {
      const todayLocCleanings = todayCleanings.filter((c) => c.locationId === loc.id);
      const lastClean = todayLocCleanings.length > 0 ? todayLocCleanings[0] : null;

      const locAudits = todayAudits.filter((a) => a.locationId === loc.id);
      const lastAudit = locAudits.length > 0 ? locAudits[0] : null;

      const activeIncident = activeIncidents.find((i) => i.locationId === loc.id);

      const dailySchedule = evaluateDailySchedule(
        loc.schedule || [],
        todayLocCleanings,
        loc.toleranceMinutes,
      );

      totalPlannedSlotsToday += (loc.schedule || []).length;
      totalMissedSlotsToday += dailySchedule.missedCount;

      return {
        id: loc.id,
        code: loc.code,
        name: loc.name,
        currentSupervisor: loc.currentSupervisorName || 'Kemal Şef',
        backupSupervisor: loc.backupSupervisorName || 'Ayşe Şef',
        slotCount: loc.schedule ? loc.schedule.length : 0,
        toleranceMinutes: loc.toleranceMinutes,
        missedCount: dailySchedule.missedCount,
        dailySchedule: dailySchedule.slots,
        lastClean: lastClean ? `${lastClean.actualTime} (${lastClean.staffName})` : null,
        lastAudit: lastAudit
          ? `${lastAudit.createdAt.toTimeString().substring(0, 5)} (${lastAudit.isApproved ? '✓ Onay' : '✗ Uygunsuzluk'})`
          : null,
        incidentStatus: activeIncident
          ? activeIncident.isEscalated
            ? 'ESCALATED'
            : 'DISPATCHED'
          : 'NORMAL',
      };
    });

    // Gerçek SLA Uyum Oranı: Kaçırılan slotları da hesaba katan kesin operasyonel oran
    const complianceRate =
      totalPlannedSlotsToday > 0
        ? Math.max(0, Math.round(((totalPlannedSlotsToday - totalMissedSlotsToday) / totalPlannedSlotsToday) * 100))
        : 100;

    return {
      kpis: {
        totalCleans,
        onTimeRate,
        outOfTimeCount,
        outOfTimeRate,
        notDoneCount,
        notDoneRate,
        missedSlotCount: totalMissedSlotsToday,
        totalPlannedSlotsToday,
        complianceRate,
        totalSurveys,
        csatRate,
        avgMTTR,
        auditCoverageRate,
      },
      paretoData,
      locationMatrix,
      auditLogs,
      allIncidents: activeIncidents.map((inc) => {
        const loc = locations.find((l) => l.id === inc.locationId);
        return {
          ...inc,
          photoUrl: inc.status === 'RESOLVED_BY_STAFF' ? inc.photoUrl : null,
          locationName: loc ? loc.name : inc.locationId,
          locationCode: loc ? loc.code : '',
        };
      }),
    };
  }

  // CSV Rapor İndirme Endpoint'i (Denetim İzi, Temizlik Kayıtları, Arıza / Şikayet Listesi)
  @Get('export-csv')
  async exportCsv(
    @Query('type') type: string = 'audit',
    @Query('limit') limitStr?: string,
    @Res() res?: Response,
  ) {
    if (!res) throw new BadRequestException('Response context missing.');
    const limit = Math.min(Math.max(parseInt(limitStr || '500', 10) || 500, 1), 2000);
    const locations = await this.locations.find();
    const locMap = new Map(locations.map((l) => [l.id, l]));

    const sanitizeCsv = (val: any) => {
      let clean = String(val ?? '').replace(/"/g, '""');
      if (/^[=+\-@]/.test(clean)) clean = `'${clean}`;
      return `"${clean}"`;
    };

    const dateStr = new Date().toISOString().substring(0, 10);
    let csv = '';
    let filename = '';

    if (type === 'cleanings') {
      filename = `WC_Temizlik_Kayitlari_${dateStr}.csv`;
      csv = '\uFEFFKayıt ID,Mahal Kodu,Mahal Adı,Personel,Planlanan Slot,Fiili Zaman,SLA Durumu,Fark (dk),Fiziki QR,Not,Kayıt Tarihi\n';
      const cleanings = await this.cleanings.find({
        order: { createdAt: 'DESC' },
        take: limit,
      });
      cleanings.forEach((c) => {
        const loc = locMap.get(c.locationId);
        csv += `${sanitizeCsv(c.id)},${sanitizeCsv(loc?.code || '')},${sanitizeCsv(loc?.name || c.locationId)},${sanitizeCsv(c.staffName)},${sanitizeCsv(c.plannedSlot)},${sanitizeCsv(c.actualTime)},${sanitizeCsv(c.slaStatus)},${c.diffMinutes},${c.isVerifiedQr ? 'Evet' : 'Hayır'},${sanitizeCsv(c.note || '')},${sanitizeCsv(c.createdAt ? new Date(c.createdAt).toLocaleString('tr-TR') : '')}\n`;
      });
    } else if (type === 'incidents') {
      filename = `WC_Ariza_Sikayet_Raporu_${dateStr}.csv`;
      csv = '\uFEFFBilet No,Mahal,Durum,Sorunlar,Nöbetçi Şef,Atanan Personel,Kademe-1 Eskalasyon,Kademe-2 Eskalasyon,Çözüm Notu,Kayıt Tarihi\n';
      const incidents = await this.incidents.find({
        order: { createdAt: 'DESC' },
        take: limit,
      });
      incidents.forEach((inc) => {
        const loc = inc.locationId ? locMap.get(inc.locationId) : null;
        const issues = Array.isArray(inc.issuesJson) ? inc.issuesJson.join('; ') : '';
        csv += `${sanitizeCsv(inc.id)},${sanitizeCsv(loc?.name || inc.locationId || 'Genel')},${sanitizeCsv(inc.status)},${sanitizeCsv(issues)},${sanitizeCsv(inc.currentSupName || '')},${sanitizeCsv(inc.assignedStaffName || '')},${inc.isEscalated ? 'Evet' : 'Hayır'},${inc.isTier2Escalated ? 'Evet' : 'Hayır'},${sanitizeCsv(inc.resolutionNote || '')},${sanitizeCsv(inc.createdAt ? new Date(inc.createdAt).toLocaleString('tr-TR') : '')}\n`;
      });
    } else {
      filename = `WC_Denetim_Izleme_Raporu_${dateStr}.csv`;
      csv = '\uFEFFZaman,Mahal,Eylem,Kullanici,Ozet\n';
      const logs = await this.auditTrail.find({
        order: { createdAt: 'DESC' },
        take: limit,
      });
      logs.forEach((log) => {
        const loc = log.locationId ? locMap.get(log.locationId) : null;
        const locName = loc ? loc.name : log.locationId || 'Genel';
        csv += `${sanitizeCsv(log.timestamp)},${sanitizeCsv(locName)},${sanitizeCsv(log.action)},${sanitizeCsv(log.userRole)},${sanitizeCsv(log.summary)}\n`;
      });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  // Geriye dönük özet rapor (legacy clients için)
  @Get()
  async summary(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const dashboard = await this.getDashboardData();
    return {
      from: from || new Date().toISOString(),
      to: to || new Date().toISOString(),
      totals: {
        cleanings: dashboard.kpis.totalCleans,
        inspections: dashboard.locationMatrix.length,
        surveys: dashboard.kpis.totalSurveys,
        averageRating: dashboard.kpis.csatRate,
      },
      restrooms: dashboard.locationMatrix.map((l) => ({
        id: l.id,
        name: l.name,
        building: 'Ana Bina',
        cleanings: dashboard.kpis.totalCleans,
        inspections: 1,
        surveys: dashboard.kpis.totalSurveys,
        averageRating: dashboard.kpis.csatRate,
      })),
      kpis: dashboard.kpis,
      paretoData: dashboard.paretoData,
      locationMatrix: dashboard.locationMatrix,
      auditLogs: dashboard.auditLogs,
    };
  }
}
