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
import { Repository } from 'typeorm';
import { JwtAuthGuard, Roles, RolesGuard } from './auth';
import {
  AuditTrail,
  CleaningRecord,
  Incident,
  Location,
  SupervisorAudit,
  SurveyFeedback,
} from './entities';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('supervisor')
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
    const [locations, cleanings, audits, surveys, incidents, auditLogs] = await Promise.all([
      this.locations.find({ order: { name: 'ASC' } }),
      this.cleanings.find({ order: { createdAt: 'DESC' } }),
      this.audits.find({ order: { createdAt: 'DESC' } }),
      this.surveys.find({ order: { createdAt: 'DESC' } }),
      this.incidents.find({ order: { createdAt: 'DESC' } }),
      this.auditTrail.find({ order: { createdAt: 'DESC' }, take: 50 }),
    ]);

    // 1. Temizlik KPI'ları
    const totalCleans = cleanings.length;
    let onTimeCount = 0;
    let outOfTimeCount = 0;
    let notDoneCount = 0;

    cleanings.forEach((c) => {
      if (c.slaStatus === 'ON_TIME') onTimeCount++;
      else if (c.slaStatus === 'OUT_OF_TIME') outOfTimeCount++;
      else if (c.slaStatus === 'NOT_DONE') notDoneCount++;
    });

    const onTimeRate = totalCleans > 0 ? Math.round((onTimeCount / totalCleans) * 100) : 0;
    const outOfTimeRate = totalCleans > 0 ? Math.round((outOfTimeCount / totalCleans) * 100) : 0;
    const notDoneRate = totalCleans > 0 ? Math.round((notDoneCount / totalCleans) * 100) : 0;

    // 2. CSAT Hesaplaması
    const totalSurveys = surveys.length;
    const goodSurveys = surveys.filter((s) => s.rating === 'good' || s.rating === '5' || s.rating === '4').length;
    const csatRate = totalSurveys > 0 ? Math.round((goodSurveys / totalSurveys) * 100) : 100;

    // 3. Ortalama Müdahale Süresi (MTTR - dakika)
    const closedIncidents = incidents.filter(
      (i) => i.status === 'VERIFIED_CLOSED' && i.resolvedAtUtc,
    );
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

    // 4. Denetim Kapsama Oranı
    const auditedLocationIds = new Set(audits.map((a) => a.locationId));
    const auditCoverageRate =
      locations.length > 0
        ? Math.round((auditedLocationIds.size / locations.length) * 100)
        : 100;

    // 5. Pareto Analizi (Kök Nedenler)
    const paretoCounts: Record<string, number> = {};
    surveys.forEach((s) => {
      if (s.issuesJson && Array.isArray(s.issuesJson)) {
        s.issuesJson.forEach((issue) => {
          paretoCounts[issue] = (paretoCounts[issue] || 0) + 1;
        });
      }
    });

    const paretoData = Object.entries(paretoCounts)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count);

    // 6. Canlı Mahal Operasyon Matrisi
    const locationMatrix = locations.map((loc) => {
      const locCleanings = cleanings.filter((c) => c.locationId === loc.id);
      const lastClean = locCleanings.length > 0 ? locCleanings[0] : null;

      const locAudits = audits.filter((a) => a.locationId === loc.id);
      const lastAudit = locAudits.length > 0 ? locAudits[0] : null;

      const activeIncident = incidents.find(
        (i) => i.locationId === loc.id && i.status !== 'VERIFIED_CLOSED',
      );

      return {
        id: loc.id,
        code: loc.code,
        name: loc.name,
        currentSupervisor: loc.currentSupervisorName || 'Kemal Şef',
        backupSupervisor: loc.backupSupervisorName || 'Ayşe Şef',
        slotCount: loc.schedule ? loc.schedule.length : 0,
        toleranceMinutes: loc.toleranceMinutes,
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

    return {
      kpis: {
        totalCleans,
        onTimeRate,
        outOfTimeCount,
        outOfTimeRate,
        notDoneCount,
        notDoneRate,
        totalSurveys,
        csatRate,
        avgMTTR,
        auditCoverageRate,
      },
      paretoData,
      locationMatrix,
      auditLogs,
    };
  }

  // CSV Rapor İndirme Endpoint'i
  @Get('export-csv')
  async exportCsv(@Res() res: Response) {
    const logs = await this.auditTrail.find({
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const locations = await this.locations.find();
    const locMap = new Map(locations.map((l) => [l.id, l.name]));

    let csv = '\uFEFFZaman,Mahal,Eylem,Kullanici,Ozet\n';
    logs.forEach((log) => {
      const locName = log.locationId ? locMap.get(log.locationId) || log.locationId : 'Genel';
      csv += `"${log.timestamp}","${locName}","${log.action}","${log.userRole}","${log.summary.replace(/"/g, '""')}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="WC_Denetim_Izleme_Raporu_${new Date().toISOString().substring(0, 10)}.csv"`,
    );
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
