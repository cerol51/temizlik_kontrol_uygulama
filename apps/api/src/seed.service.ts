import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Project,
  Location,
  ChecklistTemplate,
  ChecklistItem,
  AuditTrail,
  AppUser,
} from './entities';
import { hashPassword } from './auth';

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
    @InjectRepository(Location)
    private readonly locations: Repository<Location>,
    @InjectRepository(ChecklistTemplate)
    private readonly templates: Repository<ChecklistTemplate>,
    @InjectRepository(ChecklistItem)
    private readonly items: Repository<ChecklistItem>,
    @InjectRepository(AuditTrail)
    private readonly audit: Repository<AuditTrail>,
    @InjectRepository(AppUser)
    private readonly users: Repository<AppUser>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // 0. Varsayılan Kullanıcılar Seed
      const initialUsers = [
        {
          id: '1e9ad2f0-c4c1-4d26-a081-22f873e68501',
          fullName: 'Kemal Şef',
          username: 'kemal',
          passwordHash: hashPassword('kemal123'),
          role: 'supervisor',
        },
        {
          id: '1e9ad2f0-c4c1-4d26-a081-22f873e68502',
          fullName: 'Ayşe Şef',
          username: 'ayse',
          passwordHash: hashPassword('ayse123'),
          role: 'supervisor',
        },
        {
          id: '1e9ad2f0-c4c1-4d26-a081-22f873e68503',
          fullName: 'Sistem Yöneticisi',
          username: 'admin',
          passwordHash: hashPassword('admin123'),
          role: 'admin',
        },
        {
          id: '1e9ad2f0-c4c1-4d26-a081-22f873e68504',
          fullName: 'Ahmet Temizlik',
          username: 'ahmet',
          passwordHash: hashPassword('ahmet123'),
          role: 'employee',
        },
        {
          id: '1e9ad2f0-c4c1-4d26-a081-22f873e68505',
          fullName: 'Mehmet Hijyen',
          username: 'mehmet',
          passwordHash: hashPassword('mehmet123'),
          role: 'employee',
        },
      ];

      for (const u of initialUsers) {
        await this.users.upsert(u, ['id']);
      }

      // 1. Proje Seed
      const projectId = '1e9ad2f0-c4c1-4d26-a081-22f873e68000';
      await this.projects.upsert(
        {
          id: projectId,
          code: 'PRJ-A',
          name: 'Ana Tesis Yönetimi',
          timezone: 'Europe/Istanbul',
        },
        ['id'],
      );

      // 2. Mahaller (Locations) Seed
      const defaultLocations = [
        {
          id: '1e9ad2f0-c4c1-4d26-a081-22f873e68001',
          projectId,
          code: 'PRJ-A-ZEMIN-WC01',
          name: 'Zemin Kat - Erkek WC',
          building: 'Ana Bina',
          token: 'token-wc-01-a8f9b2',
          toleranceMinutes: 15,
          schedule: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
          currentSupervisorId: 'SUP-01',
          currentSupervisorName: 'Kemal Şef',
          backupSupervisorId: 'SUP-02',
          backupSupervisorName: 'Ayşe Şef',
          status: 'ACTIVE',
        },
        {
          id: '1e9ad2f0-c4c1-4d26-a081-22f873e68002',
          projectId,
          code: 'PRJ-A-ZEMIN-WC02',
          name: 'Zemin Kat - Kadın WC',
          building: 'Ana Bina',
          token: 'token-wc-02-c4e1d7',
          toleranceMinutes: 15,
          schedule: ['08:30', '10:30', '12:30', '14:30', '16:30', '18:30', '20:30'],
          currentSupervisorId: 'SUP-01',
          currentSupervisorName: 'Kemal Şef',
          backupSupervisorId: 'SUP-02',
          backupSupervisorName: 'Ayşe Şef',
          status: 'ACTIVE',
        },
        {
          id: '1e9ad2f0-c4c1-4d26-a081-22f873e68003',
          projectId,
          code: 'PRJ-A-KAT1-WC03',
          name: '1. Kat - Personel WC',
          building: 'Ana Bina',
          token: 'token-wc-03-f3a9e0',
          toleranceMinutes: 20,
          schedule: ['09:00', '12:00', '15:00', '18:00'],
          currentSupervisorId: 'SUP-02',
          currentSupervisorName: 'Ayşe Şef',
          backupSupervisorId: 'SUP-01',
          backupSupervisorName: 'Kemal Şef',
          status: 'ACTIVE',
        },
      ];

      for (const loc of defaultLocations) {
        await this.locations.upsert(loc, ['id']);
      }

      // 3. Sürümlü Checklist Şablonu v1.2
      const templateId = '1e9ad2f0-c4c1-4d26-a081-22f873e68099';
      await this.templates.upsert(
        {
          id: templateId,
          versionTag: 'v1.2',
          title: 'Standart Saha Denetim Şablonu',
          isActive: true,
        },
        ['id'],
      );

      // 4. Checklist Maddeleri
      const checklistTexts = [
        'Ayna ve lavabolar lekesiz',
        'Klozet ve pisuvarlar hijyenik',
        'Zemin kuru ve temiz',
        'Sabun / kağıt havlu dolu',
        'Koku durumu ferah',
        'Çöp kovası boş ve poşetli',
      ];

      for (let i = 0; i < checklistTexts.length; i++) {
        const itemId = `1e9ad2f0-c4c1-4d26-a081-22f873e68${(100 + i).toString()}`;
        await this.items.upsert(
          {
            id: itemId,
            templateId,
            itemOrder: i + 1,
            itemText: checklistTexts[i],
          },
          ['id'],
        );
      }
    } catch (err) {
      // Seed esnasında oluşabilecek hatalar geliştirme modunu durdurmasın
      console.warn('Seed initialization error:', err);
    }
  }
}
