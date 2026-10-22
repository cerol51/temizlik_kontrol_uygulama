import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import jwksRsa from 'jwks-rsa';
import { ExtractJwt, Strategy, SecretOrKeyProvider } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';

import * as crypto from 'crypto';

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

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
export const Public = () => SetMetadata('isPublic', true);

const APP_JWT_SECRET = process.env.APP_JWT_SECRET || 'wc-cleaning-secure-secret-2026-key';

export interface AppTokenPayload {
  sub: string;
  name: string;
  username: string;
  roles: string[];
  exp: number;
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + APP_JWT_SECRET).digest('hex');
}

export function signAppToken(user: { id: string; fullName: string; username: string; role: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const roles = [user.role];
  if (user.role === 'supervisor') {
    roles.push('admin');
  } else if (user.role === 'admin') {
    roles.push('supervisor');
  }
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      name: user.fullName,
      username: user.username,
      roles,
      exp: Math.floor(Date.now() / 1000) + 14 * 24 * 3600, // 14 gün
    }),
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', APP_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

export function verifyAppToken(token: string): AuthenticatedUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', APP_JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (signature !== expectedSig) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AppTokenPayload;
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      id: data.sub,
      name: data.name || data.username,
      roles: data.roles || ['employee'],
    };
  } catch {
    return null;
  }
}

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

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Yerel uygulama tokenı kontrolü
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const appUser = verifyAppToken(token);
      if (appUser) {
        request.user = appUser;
        return true;
      }
    }

    return super.canActivate(context);
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
    return requiredRoles.some((role) => request.user!.roles.includes(role));
  }
}
