import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard, JwtStrategy, RolesGuard } from './auth';
import {
  AppUser,
  AuditTrail,
  ChecklistItem,
  ChecklistTemplate,
  CleaningRecord,
  Incident,
  Location,
  NotificationDispatch,
  Project,
  PushSubscription,
  SupervisorAudit,
  SurveyFeedback,
} from './entities';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ReportsController } from './operations.controller';
import { RestroomsController } from './restrooms.controller';
import { AuthController } from './auth.controller';
import { SeedService } from './seed.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url:
        process.env.DATABASE_URL ??
        'postgres://wc_cleaning:wc_cleaning@localhost:5432/wc_cleaning',
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    TypeOrmModule.forFeature([
      Project,
      Location,
      ChecklistTemplate,
      ChecklistItem,
      CleaningRecord,
      SupervisorAudit,
      Incident,
      NotificationDispatch,
      SurveyFeedback,
      AuditTrail,
      PushSubscription,
      AppUser,
    ]),
  ],
  controllers: [
    AuthController,
    RestroomsController,
    NotificationsController,
    ReportsController,
  ],
  providers: [
    NotificationsService,
    SeedService,
    JwtStrategy,
    RolesGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
