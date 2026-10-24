import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AppUser, AuditTrail } from './entities';
import {
  APP_ROLES,
  AppRole,
  AuthenticatedUser,
  hashPassword,
  JwtAuthGuard,
  MIN_PASSWORD_LENGTH,
  Public,
  Roles,
  RolesGuard,
  signAppToken,
  verifyPassword,
} from './auth';
import { CurrentUser } from './user.decorator';

import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  username: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, { message: `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.` })
  @MaxLength(128)
  password: string;

  /**
   * Geriye dönük uyumluluk için kabul edilir ancak YOK SAYILIR.
   * Açık kayıt her zaman 'employee' rolüyle oluşturulur; rol atamasını yalnızca admin yapar.
   */
  @IsOptional()
  @IsString()
  role?: string;
}

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  username: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  username: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, { message: `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.` })
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsIn(APP_ROLES, { message: 'Rol admin, supervisor veya employee olmalıdır.' })
  role?: AppRole;
}

function toPublicUser(user: AppUser) {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    @InjectRepository(AppUser)
    private readonly usersRepo: Repository<AppUser>,
    @InjectRepository(AuditTrail)
    private readonly auditRepo: Repository<AuditTrail>,
  ) {}

  // 1. Kullanıcı Kaydı (Public) — rol her zaman 'employee'
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() body: RegisterDto) {
    const fullName = body.fullName.trim();
    const username = body.username.trim().toLowerCase();
    const password = body.password;
    const role: AppRole = 'employee';

    if (!fullName || !username) {
      throw new BadRequestException('Ad Soyad ve kullanıcı adı zorunludur.');
    }

    const existing = await this.usersRepo.findOne({ where: { username } });
    if (existing) {
      throw new BadRequestException(`"${username}" kullanıcı adı zaten kullanımda.`);
    }

    const newUser = await this.usersRepo.save(
      this.usersRepo.create({
        id: randomUUID(),
        fullName,
        username,
        passwordHash: await hashPassword(password),
        role,
        createdAt: new Date(),
      }),
    );

    await this.audit(
      'KULLANICI_KAYIT',
      role,
      `Yeni kullanıcı kaydoldu: ${fullName} (@${username}, Rol: ${role})`,
    );

    return { token: signAppToken(newUser), user: toPublicUser(newUser) };
  }

  // 2. Kullanıcı Girişi (Public) — kaba kuvvet denemelerine karşı sınırlı
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(@Body() body: LoginDto) {
    const username = body.username.trim().toLowerCase();
    const user = await this.usersRepo.findOne({ where: { username } });

    // Kullanıcı yoksa da hash doğrulaması yapılır; yanıt süresinden kullanıcı varlığı anlaşılmasın.
    const { valid, needsRehash } = await verifyPassword(
      body.password,
      user?.passwordHash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA',
    );
    if (!user || !valid) {
      throw new UnauthorizedException('Kullanıcı adı veya şifre hatalı.');
    }

    if (needsRehash) {
      user.passwordHash = await hashPassword(body.password);
      await this.usersRepo.save(user);
    }

    await this.audit(
      'KULLANICI_GIRIS',
      user.role,
      `Kullanıcı sisteme giriş yaptı: ${user.fullName} (@${user.username})`,
    );

    return { token: signAppToken(user), user: toPublicUser(user) };
  }

  // 3. Mevcut Kullanıcı Bilgisi
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.usersRepo.findOne({ where: { id: currentUser.id } });
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı.');
    return toPublicUser(user);
  }

  // 4. Admin & Şef - Kayıtlı Kullanıcıları Listele
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'supervisor')
  @Get('users')
  async listUsers() {
    return this.usersRepo.find({
      order: { createdAt: 'DESC' },
      select: ['id', 'fullName', 'username', 'role', 'createdAt'],
    });
  }

  // 5. Admin - Yeni Kullanıcı Ekle
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('users')
  async createUser(
    @Body() body: CreateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const fullName = body.fullName.trim();
    const username = body.username.trim().toLowerCase();
    const role: AppRole = body.role ?? 'employee';

    const existing = await this.usersRepo.findOne({ where: { username } });
    if (existing) {
      throw new BadRequestException(`"${username}" kullanıcı adı zaten kullanımda.`);
    }

    const newUser = await this.usersRepo.save(
      this.usersRepo.create({
        id: randomUUID(),
        fullName,
        username,
        passwordHash: await hashPassword(body.password),
        role,
        createdAt: new Date(),
      }),
    );

    await this.audit(
      'ADMIN_KULLANICI_EKLE',
      `admin (${currentUser.name})`,
      `Yönetici yeni kullanıcı oluşturdu: ${fullName} (@${username}, Rol: ${role})`,
    );

    return toPublicUser(newUser);
  }

  // 6. Admin - Kullanıcı Sil
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('users/:id')
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    if (currentUser.id === id) {
      throw new BadRequestException('Oturum açık olan aktif kendi kullanıcınızı silemezsiniz.');
    }

    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    if (user.role === 'admin') {
      const adminCount = await this.usersRepo.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        throw new BadRequestException('Sistemdeki son admin kullanıcısı silinemez.');
      }
    }

    await this.usersRepo.delete(id);

    await this.audit(
      'ADMIN_KULLANICI_SIL',
      `admin (${currentUser.name})`,
      `Yönetici kullanıcıyı sildi: ${user.fullName} (@${user.username})`,
    );

    return { success: true, message: `"${user.fullName}" kullanıcısı başarıyla silindi.` };
  }

  private async audit(action: string, userRole: string, summary: string): Promise<void> {
    await this.auditRepo.save({
      id: randomUUID(),
      timestamp: new Date().toTimeString().substring(0, 5),
      locationId: null,
      action,
      userRole,
      summary,
    });
  }
}
