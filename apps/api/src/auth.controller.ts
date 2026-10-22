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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AppUser, AuditTrail } from './entities';
import {
  AuthenticatedUser,
  hashPassword,
  JwtAuthGuard,
  Public,
  Roles,
  RolesGuard,
  signAppToken,
} from './auth';
import { CurrentUser } from './user.decorator';

export class RegisterDto {
  fullName: string;
  username: string;
  password: string;
  role?: string;
}

export class LoginDto {
  username: string;
  password: string;
}

export class CreateUserDto {
  fullName: string;
  username: string;
  password: string;
  role?: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    @InjectRepository(AppUser)
    private readonly usersRepo: Repository<AppUser>,
    @InjectRepository(AuditTrail)
    private readonly auditRepo: Repository<AuditTrail>,
  ) {}

  // 1. Kullanıcı Kaydı (Public)
  @Public()
  @Post('register')
  async register(@Body() body: RegisterDto) {
    const fullName = body.fullName?.trim();
    const rawUsername = body.username?.trim().toLowerCase();
    const password = body.password?.trim();
    const role = (body.role === 'supervisor' || body.role === 'admin') ? 'supervisor' : 'employee';

    if (!fullName || !rawUsername || !password) {
      throw new BadRequestException('Ad Soyad, kullanıcı adı ve şifre zorunludur.');
    }

    if (password.length < 4) {
      throw new BadRequestException('Şifre en az 4 karakter olmalıdır.');
    }

    const existing = await this.usersRepo.findOne({ where: { username: rawUsername } });
    if (existing) {
      throw new BadRequestException(`"${rawUsername}" kullanıcı adı zaten kullanımda.`);
    }

    const id = randomUUID();
    const newUser = this.usersRepo.create({
      id,
      fullName,
      username: rawUsername,
      passwordHash: hashPassword(password),
      role,
      createdAt: new Date(),
    });

    await this.usersRepo.save(newUser);

    // Denetim İzi Kaydı
    const nowStr = new Date().toTimeString().substring(0, 5);
    await this.auditRepo.save({
      id: randomUUID(),
      timestamp: nowStr,
      locationId: null,
      action: 'KULLANICI_KAYIT',
      userRole: role,
      summary: `Yeni kullanıcı kaydoldu: ${fullName} (@${rawUsername}, Rol: ${role})`,
    });

    const token = signAppToken({
      id: newUser.id,
      fullName: newUser.fullName,
      username: newUser.username,
      role: newUser.role,
    });

    return {
      token,
      user: {
        id: newUser.id,
        fullName: newUser.fullName,
        username: newUser.username,
        role: newUser.role,
        createdAt: newUser.createdAt,
      },
    };
  }

  // 2. Kullanıcı Girişi (Public)
  @Public()
  @Post('login')
  async login(@Body() body: LoginDto) {
    const rawUsername = body.username?.trim().toLowerCase();
    const password = body.password?.trim();

    if (!rawUsername || !password) {
      throw new BadRequestException('Kullanıcı adı ve şifre zorunludur.');
    }

    const user = await this.usersRepo.findOne({ where: { username: rawUsername } });
    if (!user || user.passwordHash !== hashPassword(password)) {
      throw new UnauthorizedException('Kullanıcı adı veya şifre hatalı.');
    }

    // Denetim İzi
    const nowStr = new Date().toTimeString().substring(0, 5);
    await this.auditRepo.save({
      id: randomUUID(),
      timestamp: nowStr,
      locationId: null,
      action: 'KULLANICI_GIRIS',
      userRole: user.role,
      summary: `Kullanıcı sisteme giriş yaptı: ${user.fullName} (@${user.username})`,
    });

    const token = signAppToken({
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }

  // 3. Mevcut Kullanıcı Bilgisi
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.usersRepo.findOne({ where: { id: currentUser.id } });
    if (!user) {
      return {
        id: currentUser.id,
        fullName: currentUser.name,
        username: currentUser.name,
        role: currentUser.roles.includes('supervisor') ? 'supervisor' : 'employee',
      };
    }
    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  // 4. Admin - Kayıtlı Kullanıcıları Listele
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor', 'admin')
  @Get('users')
  async listUsers() {
    const users = await this.usersRepo.find({
      order: { createdAt: 'DESC' },
      select: ['id', 'fullName', 'username', 'role', 'createdAt'],
    });
    return users;
  }

  // 5. Admin - Yeni Kullanıcı Ekle
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor', 'admin')
  @Post('users')
  async createUser(
    @Body() body: CreateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const fullName = body.fullName?.trim();
    const rawUsername = body.username?.trim().toLowerCase();
    const password = body.password?.trim();
    const role = (body.role === 'supervisor' || body.role === 'admin') ? 'supervisor' : 'employee';

    if (!fullName || !rawUsername || !password) {
      throw new BadRequestException('Ad Soyad, kullanıcı adı ve şifre zorunludur.');
    }

    if (password.length < 4) {
      throw new BadRequestException('Şifre en az 4 karakter olmalıdır.');
    }

    const existing = await this.usersRepo.findOne({ where: { username: rawUsername } });
    if (existing) {
      throw new BadRequestException(`"${rawUsername}" kullanıcı adı zaten kullanımda.`);
    }

    const id = randomUUID();
    const newUser = this.usersRepo.create({
      id,
      fullName,
      username: rawUsername,
      passwordHash: hashPassword(password),
      role,
      createdAt: new Date(),
    });

    await this.usersRepo.save(newUser);

    // Denetim İzi
    const nowStr = new Date().toTimeString().substring(0, 5);
    await this.auditRepo.save({
      id: randomUUID(),
      timestamp: nowStr,
      locationId: null,
      action: 'ADMIN_KULLANICI_EKLE',
      userRole: currentUser.roles.join(','),
      summary: `Yönetici yeni kullanıcı oluşturdu: ${fullName} (@${rawUsername}, Rol: ${role})`,
    });

    return {
      id: newUser.id,
      fullName: newUser.fullName,
      username: newUser.username,
      role: newUser.role,
      createdAt: newUser.createdAt,
    };
  }

  // 6. Admin - Kullanıcı Sil
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor', 'admin')
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

    await this.usersRepo.delete(id);

    // Denetim İzi
    const nowStr = new Date().toTimeString().substring(0, 5);
    await this.auditRepo.save({
      id: randomUUID(),
      timestamp: nowStr,
      locationId: null,
      action: 'ADMIN_KULLANICI_SIL',
      userRole: currentUser.roles.join(','),
      summary: `Yönetici kullanıcıyı sildi: ${user.fullName} (@${user.username})`,
    });

    return { success: true, message: `"${user.fullName}" kullanıcısı başarıyla silindi.` };
  }
}
