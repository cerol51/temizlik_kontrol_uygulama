import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
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

import { SlaService } from './domain/sla/sla.service';
import { LocationsService } from './domain/locations/locations.service';
import { IncidentsService } from './domain/incidents/incidents.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        autoLoadEntities: true,
      }),
      dataSourceFactory: async (options) => {
        if (!options) throw new Error('TypeORM options are undefined');
        const pgUrl =
          process.env.DATABASE_URL ??
          'postgres://wc_cleaning:wc_cleaning@localhost:5432/wc_cleaning';

        let usePg = false;
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { Client } = require('pg');
          const client = new Client({
            connectionString: pgUrl,
            connectionTimeoutMillis: 1500,
          });
          await client.connect();
          await client.end();
          usePg = true;
        } catch {
          usePg = false;
        }

        if (usePg) {
          console.log(`[Database] PostgreSQL veritabanına bağlanıldı (${pgUrl}).`);
          const ds = new DataSource({
            ...options,
            type: 'postgres',
            url: pgUrl,
            synchronize: true,
          } as DataSourceOptions);
          return await ds.initialize();
        } else {
          if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_IN_MEMORY_DB) {
            throw new Error(
              '[Güvenlik] PostgreSQL bağlantısı başarısız oldu! Üretim ortamında (NODE_ENV=production) ' +
                'in-memory veritabanına sessiz geçiş engellenmiştir. Lütfen veritabanını başlatın.',
            );
          }
          console.warn(
            '[Database] PostgreSQL servisi bulunamadı. Geliştirme modu için in-memory veritabanı (pg-mem) başlatıldı. (Sunucu yeniden başlayınca sıfırlanır)',
          );
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { newDb } = require('pg-mem');
          const db = newDb({ autoCreateForeignKeyIndices: true });
          db.public.registerFunction({
            name: 'version',
            implementation: () => 'PostgreSQL 15.0',
          });
          db.public.registerFunction({
            name: 'current_database',
            implementation: () => 'wc_cleaning',
          });
          const ds = await db.adapters.createTypeormDataSource({
            ...options,
            type: 'postgres',
            synchronize: true,
          });
          return await ds.initialize();
        }
      },
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
    SlaService,
    LocationsService,
    IncidentsService,
    NotificationsService,
    SeedService,
    JwtStrategy,
    RolesGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
