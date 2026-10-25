import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import jwksRsa from 'jwks-rsa';
import { ExtractJwt, Strategy, SecretOrKeyProvider } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { AppUser } from './entities';

export type AppRole = 'admin' | 'supervisor' | 'employee';
export const APP_ROLES: AppRole[] = ['admin', 'supervisor', 'employee'];

export interface AuthenticatedUser {
  id: string;
  name: string;
  roles: string[];
}

interface KeycloakClaims {
  sub: string;
  name?: string;
  preferred_username?: string;
  realm_access?: { roles?: string[] };
}

export const Roles = (...roles: AppRole[]) => SetMetadata('roles', roles);
export const Public = () => SetMetadata('isPublic', true);

/** Kısa ömürlü Erişim Tokenı (Access Token): 15 dakika */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Uzun ömürlü Yenileme Tokenı (Refresh Token): 7 gün */
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 3600;
/** Geriye dönük uyumluluk alias */
export const TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL_SECONDS;

export const isProduction = () => process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// İmza anahtarı
// ---------------------------------------------------------------------------
// .env dosyası ConfigModule tarafından modül yüklendikten SONRA okunduğu için
// anahtar ilk kullanımda (lazy) çözülür.
let cachedSecret: string | null = null;

function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret;
  const configured = process.env.APP_JWT_SECRET;
  if (configured && configured.length >= 32) {
    cachedSecret = configured;
    return cachedSecret;
  }
  if (isProduction()) {
    throw new Error(
      '[Güvenlik] APP_JWT_SECRET üretim ortamında zorunludur ve en az 32 karakter olmalıdır.',
    );
  }
  cachedSecret = crypto.randomBytes(48).toString('hex');
  console.warn(
    '[Güvenlik] APP_JWT_SECRET tanımlı değil veya 32 karakterden kısa. Geçici rastgele anahtar üretildi; ' +
      'sunucu yeniden başlatıldığında tüm oturumlar düşer. Kalıcı anahtar için .env dosyasına APP_JWT_SECRET ekleyin.',
  );
  return cachedSecret;
}

/** Uygulama açılışında anahtarı doğrular (üretimde eksikse fail-fast). */
export function assertAuthConfiguration(): void {
  getJwtSecret();
}

function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const bufA = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const bufB = Buffer.isBuffer(b) ? b : Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Şifre hash'leme (scrypt, kullanıcı başına rastgele tuz)
// ---------------------------------------------------------------------------
const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const SCRYPT_KEYLEN = 64;
export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  const { N, r, p } = SCRYPT_PARAMS;
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!stored) return { valid: false, needsRehash: false };

  // Yalnızca güvenli scrypt hash'leri kabul edilir; zayıf legacy SHA-256 saldırı yüzeyini kapatmak için kaldırılmıştır.
  if (stored.startsWith('scrypt$')) {
    const [, n, r, p, saltB64, hashB64] = stored.split('$');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return { valid: safeEqual(actual, expected), needsRehash: false };
  }

  return { valid: false, needsRehash: false };
}

// ---------------------------------------------------------------------------
// Uygulama tokenı (HS256) - Access & Refresh Token Çifti
// ---------------------------------------------------------------------------
export interface AppTokenPayload {
  sub: string;
  name: string;
  username: string;
  role: AppRole;
  type?: 'access' | 'refresh';
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  token: string;
  expiresIn: number;
}

export function signAppToken(user: { id: string; fullName: string; username: string; role: string }): string {
  return signTokenPair(user).accessToken;
}

export function signTokenPair(user: { id: string; fullName: string; username: string; role: string }): TokenPair {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

  // 15 dakikalık Access Token
  const accessPayload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      name: user.fullName,
      username: user.username,
      role: user.role,
      type: 'access',
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
    }),
  ).toString('base64url');

  const accessSig = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${header}.${accessPayload}`)
    .digest('base64url');

  const accessToken = `${header}.${accessPayload}.${accessSig}`;

  // 7 günlük Refresh Token
  const refreshPayload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      username: user.username,
      type: 'refresh',
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + REFRESH_TOKEN_TTL_SECONDS,
    }),
  ).toString('base64url');

  const refreshSig = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${header}.${refreshPayload}`)
    .digest('base64url');

  const refreshToken = `${header}.${refreshPayload}.${refreshSig}`;

  return {
    accessToken,
    refreshToken,
    token: accessToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/** İstekten (Header, Cookie veya yalnızca SSE için Query) token ayıklayıcı */
export function extractTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  if (request.headers?.cookie) {
    const match = request.headers.cookie.match(/(?:^|;\s*)(?:wc_token|wc_auth)=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  // Güvenlik Sertleştirmesi (P1): Query string token kabulü yalnızca tarayıcı EventSource kısıtı olan SSE uç noktasıyla sınırlandırılmıştır.
  // Standart REST API uç noktalarında log ve Referrer sızıntısını önlemek için URL'den token kabul edilmez.
  const path = request.path || (request as any).url || '';
  if (path.includes('/notifications/stream') && typeof (request.query as Record<string, unknown>)?.token === 'string') {
    return (request.query as Record<string, unknown>).token as string;
  }
  return null;
}

/** İmza ve süreyi doğrular. Rol bilgisi için veritabanı esas alınır (bkz. JwtAuthGuard). */
export function verifyAppToken(token: string): AppTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;

    const headerData = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    if (headerData?.alg !== 'HS256') return null;

    const expectedSig = crypto
      .createHmac('sha256', getJwtSecret())
      .update(`${header}.${payload}`)
      .digest('base64url');
    if (!safeEqual(signature, expectedSig)) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AppTokenPayload;
    if (!data.sub || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Keycloak (OIDC) stratejisi
// ---------------------------------------------------------------------------
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const issuer =
      process.env.OIDC_ISSUER ?? 'http://localhost:8080/realms/wc-cleaning';
    const keyProvider = jwksRsa.passportJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `${issuer}/protocol/openid-connect/certs`,
    });

    const secretOrKeyProvider: SecretOrKeyProvider = (request, token, done) =>
      keyProvider(request, token, done);

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      issuer,
      algorithms: ['RS256'],
      secretOrKeyProvider,
    });
  }

  validate(claims: KeycloakClaims): AuthenticatedUser {
    if (!claims.sub) {
      throw new UnauthorizedException('Kimlik sağlayıcı kullanıcı kimliği göndermedi.');
    }

    return {
      id: claims.sub,
      name: claims.name ?? claims.preferred_username ?? claims.sub,
      roles: claims.realm_access?.roles ?? [],
    };
  }
}

// ---------------------------------------------------------------------------
// Guard'lar
// ---------------------------------------------------------------------------
interface CachedUser {
  user: AppUser;
  cachedAt: number;
}
const userCache = new Map<string, CachedUser>();
const USER_CACHE_TTL_MS = 30000; // 30 saniye TTL

export function invalidateUserCache(userId?: string): void {
  if (userId) {
    userCache.delete(userId);
  } else {
    userCache.clear();
  }
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(AppUser)
    private readonly users: Repository<AppUser>,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const rawToken = extractTokenFromRequest(request);

    if (rawToken) {
      const payload = verifyAppToken(rawToken);
      if (payload) {
        if (payload.type === 'refresh') {
          throw new UnauthorizedException('Yenileme (refresh) tokenı API uç noktalarında doğrudan kullanılamaz.');
        }
        // Token geçerli olsa bile kullanıcı hâlâ var mı ve rolü ne? Veritabanı ve TTL cache esas alınır.
        const now = Date.now();
        const cached = userCache.get(payload.sub);
        let user: AppUser | null = null;

        if (cached && now - cached.cachedAt < USER_CACHE_TTL_MS) {
          user = cached.user;
        } else {
          user = await this.users.findOne({ where: { id: payload.sub } });
          if (user) {
            userCache.set(payload.sub, { user, cachedAt: now });
          } else {
            userCache.delete(payload.sub);
          }
        }

        if (!user) throw new UnauthorizedException('Oturum geçersiz. Lütfen tekrar giriş yapın.');
        request.user = { id: user.id, name: user.fullName, roles: [user.role] };
        return true;
      }
    }

    return (await super.canActivate(context)) as boolean;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!request.user) throw new UnauthorizedException();
    return requiredRoles.some(
      (role) => request.user!.roles.includes(role) || request.user!.roles.includes('admin'),
    );
  }
}
