import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { AuthenticatedUser, extractTokenFromRequest, JwtAuthGuard, Public, Roles, RolesGuard, verifyAppToken } from './auth';
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
import { ChecklistItem, ChecklistTemplate } from './entities';
import { CurrentUser } from './user.decorator';
import { SlaService } from './domain/sla/sla.service';
import { LocationsService } from './domain/locations/locations.service';
import { IncidentsService } from './domain/incidents/incidents.service';

// Testler ve dış modüllerle 100% geriye dönük uyumluluk re-export'ları
export {
  evaluateSLA,
  evaluateDailySchedule,
  getCurrentTimeStr,
  getStartOfTodayIstanbul,
  generateIncidentId,
  SlotEvaluation,
} from './domain/sla/sla.service';

@Controller()
export class RestroomsController {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly incidentsService: IncidentsService,
    private readonly slaService: SlaService,
    @InjectRepository(ChecklistTemplate)
    private readonly templates: Repository<ChecklistTemplate>,
    @InjectRepository(ChecklistItem)
    private readonly items: Repository<ChecklistItem>,
  ) {}

  @Get('health')
  @Public()
  health(): { status: string; version: string; timestamp: string } {
    return { status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() };
  }

  // Kurumsal Readiness (Hazırlık) Probu: Veritabanı canlılığı, bellek kullanımı ve çalışma süresi
  @Get('health/ready')
  @Public()
  async healthReady() {
    const start = Date.now();
    let dbStatus = 'UP';
    let dbLatencyMs = 0;
    try {
      await this.templates.query('SELECT 1');
      dbLatencyMs = Date.now() - start;
    } catch {
      dbStatus = 'DOWN';
    }

    const mem = process.memoryUsage();
    const isHealthy = dbStatus === 'UP';

    return {
      status: isHealthy ? 'UP' : 'DOWN',
      checks: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
        memory: {
          rssMb: Math.round(mem.rss / 1024 / 1024),
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        },
        process: {
          uptimeSeconds: Math.round(process.uptime()),
          nodeVersion: process.version,
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Sürümlü Aktif Checklist Şablonunu Getir
  @Get('checklists/active')
  @Public()
  async getActiveChecklist() {
    const template = await this.templates.findOne({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
    if (!template) {
      return {
        id: 'default',
        versionTag: 'v1.2',
        title: 'Standart Saha Denetim Şablonu',
        items: [
          'Ayna ve lavabolar lekesiz',
          'Klozet ve pisuvarlar hijyenik',
          'Zemin kuru ve temiz',
          'Sabun / kağıt havlu dolu',
          'Koku durumu ferah',
          'Çöp kovası boş ve poşetli',
        ],
      };
    }
    const items = await this.items.find({
      where: { templateId: template.id },
      order: { itemOrder: 'ASC' },
    });
    return {
      id: template.id,
      versionTag: template.versionTag,
      title: template.title,
      items: items.map((i) => i.itemText),
    };
  }

  // Tüm mahaller (Public listeleme / seçim)
  @Get(['locations', 'restrooms'])
  @Public()
  async listLocations(@Req() req: Request) {
    const rawToken = extractTokenFromRequest(req);
    let isAdmin = false;
    if (rawToken) {
      try {
        const payload = verifyAppToken(rawToken);
        if (payload?.role === 'admin') {
          isAdmin = true;
        }
      } catch {
        // ignore
      }
    }
    return this.locationsService.listLocations(isAdmin);
  }

  // Admin için QR Etiketi Token'ını Güvenli Alma Uç Noktası
  @Get('locations/:id/qr-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getLocationQrToken(@Param('id') id: string) {
    return this.locationsService.getLocationQrToken(id);
  }

  // Opaque QR Token Çözümleme (Zero-Friction Routing)
  @Get('q/:token')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async resolveByToken(@Param('token') token: string) {
    return this.locationsService.resolveByToken(token);
  }

  // Mahal Detay & Durum Bilgisi (Public / Misafir)
  @Get(['locations/:id/public', 'restrooms/:id/public'])
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async publicStatus(@Param('id') id: string) {
    return this.locationsService.getPublicStatus(id);
  }

  // Mahal Detay & Yönetim Durumu (Şef ve Personel için)
  @Get(['locations/:id/supervisor', 'restrooms/:id/supervisor'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor', 'employee', 'admin')
  async supervisorStatus(@Param('id') id: string) {
    return this.locationsService.getSupervisorStatus(id);
  }

  // 1. Personel Temizlik Beyanı Oluşturma
  @Post(['locations/:id/cleanings', 'restrooms/:id/cleanings'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('employee')
  async createCleaning(
    @Param('id') locationId: string,
    @Body() body: CreateCleaningRecordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.incidentsService.createCleaning(locationId, body, user);
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
    return this.incidentsService.createAudit(locationId, body, user);
  }

  // 3. Ziyaretçi Memnuniyet Anketi (3 Emoji + Kök Neden + Korelasyon)
  @Post('surveys')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async createSurvey(@Body() body: CreateSurveyFeedbackDto, @Req() req: Request) {
    return this.incidentsService.createSurvey(body, req);
  }

  // 3.5. Tüm Aktif Olayları / Bildirimleri Getir (Çoklu Mahal Takibi)
  @Get('incidents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor', 'employee', 'admin')
  async getIncidents(
    @Query('locationId') locationId?: string,
    @Query('includeClosed') includeClosed?: string,
  ) {
    return this.incidentsService.getIncidents(locationId, includeClosed);
  }

  // 4. Şef Olay Görevlendirme (Dispatch)
  @Post('incidents/:id/dispatch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor', 'admin')
  async dispatchIncident(
    @Param('id') incidentId: string,
    @Body() body: DispatchIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.incidentsService.dispatch(incidentId, body, user);
  }

  // 5. Personel Müdahaleyi Tamamlama
  @Post('incidents/:id/staff-resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('employee')
  async staffResolve(
    @Param('id') incidentId: string,
    @Body() body: StaffResolveIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.incidentsService.staffResolve(incidentId, body, user);
  }

  // 6. Şef Doğrulama ve Kapatma (Verify & Close)
  @Post('incidents/:id/verify-close')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor', 'admin')
  async verifyAndClose(
    @Param('id') incidentId: string,
    @Body() body: VerifyCloseIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.incidentsService.verifyAndClose(incidentId, body, user);
  }

  // 6.5. Manuel Eskalasyon Tetikleme (Test / Acil Durum)
  @Post('incidents/auto-escalate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'supervisor')
  async triggerAutoEscalate() {
    const count = await this.incidentsService.checkAutoEscalations();
    return { success: true, escalatedCount: count };
  }

  // 7. Plan ve Tolerans Güncelleme
  @Put('locations/:id/schedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor', 'admin')
  async updateSchedule(
    @Param('id') locationId: string,
    @Body() body: UpdateScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.updateSchedule(locationId, body, user.name || 'Şef');
  }

  // 8. Yeni WC Noktası Ekleme (yalnızca Admin)
  @Post(['locations', 'restrooms'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async createLocation(
    @Body() body: CreateLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.createLocation(body, user.name || 'Yönetici');
  }

  // 9. WC Noktası Güncelleme
  @Put(['locations/:id/details', 'restrooms/:id/details'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateLocation(
    @Param('id') id: string,
    @Body() body: UpdateLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.updateLocation(id, body, user.name || 'Yönetici');
  }

  // 10. QR Token Yenileme (Eski tokenı iptal et, yeni token ata)
  @Post(['locations/:id/regenerate-token', 'restrooms/:id/regenerate-token'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async regenerateToken(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.regenerateToken(id, user.name || 'Yönetici');
  }

  // 11. WC Noktası Silme / Arşivleme
  @Delete(['locations/:id', 'restrooms/:id'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteLocation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.deleteLocation(id, user.name || 'Yönetici');
  }
}
