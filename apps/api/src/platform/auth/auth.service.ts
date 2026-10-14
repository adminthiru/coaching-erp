import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashToken, TokenService } from './token.service';
import { loadEnv } from '../../common/config/env';
import type { LoginInput } from '@acadia/validation';

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly env = loadEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginInput, meta: RequestMeta) {
    const user = await this.prisma.platformUser.findUnique({ where: { email: input.email } });

    // One message and one timing profile for every failure mode, so the endpoint
    // cannot be used to enumerate which addresses have accounts.
    const invalid = () =>
      new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });

    if (!user || user.deletedAt || !user.isActive) {
      await argon2.hash('timing-equalizer');
      throw invalid();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: `Too many failed attempts. Try again after ${user.lockedUntil.toISOString().slice(11, 16)} UTC.`,
      });
    }

    const ok = await argon2.verify(user.passwordHash, input.password).catch(() => false);
    if (!ok) {
      const attempts = user.failedLoginAttempts + 1;
      await this.prisma.platformUser.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      throw invalid();
    }

    const session = await this.startSession(user.id, meta);

    await this.prisma.platformUser.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.login',
      entityType: 'PlatformUser',
      entityId: user.id,
      ...meta,
    });

    return {
      ...session,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  /**
   * Refresh rotates: the presented token is consumed and a fresh one issued. If a
   * token is ever replayed after rotation it will not match any live session, so
   * a stolen refresh token is good for at most one use.
   */
  async refresh(refreshToken: string, meta: RequestMeta) {
    const session = await this.prisma.platformSession.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException({ code: 'REFRESH_INVALID', message: 'Please sign in again.' });
    }
    if (!session.user.isActive || session.user.deletedAt) {
      throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Your account is no longer active.' });
    }

    const next = this.tokens.newOpaqueToken();
    await this.prisma.platformSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: next.hash,
        lastUsedAt: new Date(),
        expiresAt: refreshExpiry(this.env.JWT_REFRESH_TTL),
        userAgent: meta.userAgent ?? session.userAgent,
        ipAddress: meta.ip ?? session.ipAddress,
      },
    });

    const accessToken = await this.tokens.signAccess({
      sub: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sid: session.id,
    });

    return {
      accessToken,
      refreshToken: next.token,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
      },
    };
  }

  async logout(sessionId: string, meta: RequestMeta) {
    const session = await this.prisma.platformSession.findUnique({
      where: { id: sessionId },
      select: { userId: true, user: { select: { email: true } } },
    });
    await this.prisma.platformSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (session) {
      await this.audit.record({
        actorType: 'PLATFORM',
        actorId: session.userId,
        actorEmail: session.user.email,
        action: 'auth.logout',
        entityType: 'PlatformSession',
        entityId: sessionId,
        ...meta,
      });
    }
  }

  /** Spec §9 — device/session management. */
  listSessions(userId: string, currentSessionId: string) {
    return this.prisma.platformSession
      .findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastUsedAt: 'desc' },
        select: { id: true, userAgent: true, ipAddress: true, lastUsedAt: true, createdAt: true },
      })
      .then((rows) => rows.map((r) => ({ ...r, isCurrent: r.id === currentSessionId })));
  }

  async revokeSession(userId: string, sessionId: string) {
    const { count } = await this.prisma.platformSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!count) throw new BadRequestException({ code: 'NOT_FOUND', message: 'That session is already signed out.' });
  }

  async revokeAllOtherSessions(userId: string, keepSessionId: string) {
    const { count } = await this.prisma.platformSession.updateMany({
      where: { userId, revokedAt: null, id: { not: keepSessionId } },
      data: { revokedAt: new Date() },
    });
    return { revoked: count };
  }

  /**
   * Always resolves, whether or not the address exists — the response must not
   * reveal which emails are registered. The token is returned only in development
   * so the flow is testable before an email provider is wired up.
   */
  async forgotPassword(email: string, meta: RequestMeta) {
    const user = await this.prisma.platformUser.findUnique({ where: { email } });
    if (!user || user.deletedAt || !user.isActive) {
      return { sent: true as const };
    }

    const raw = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.forgot_password',
      entityType: 'PlatformUser',
      entityId: user.id,
      ...meta,
    });

    this.logger.warn(`Password reset requested for ${user.email} (no mailer configured yet)`);
    return this.env.NODE_ENV === 'development' ? { sent: true as const, token: raw } : { sent: true as const };
  }

  async resetPassword(token: string, password: string, meta: RequestMeta) {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!row || row.usedAt || row.expiresAt <= new Date()) {
      throw new BadRequestException({ code: 'TOKEN_INVALID', message: 'That reset link has expired. Request a new one.' });
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    // Resetting a password signs out every existing device — a reset is the usual
    // response to a suspected compromise, so live sessions must not survive it.
    await this.prisma.$transaction([
      this.prisma.platformUser.update({
        where: { id: row.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      this.prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.platformSession.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: row.userId,
      actorEmail: row.user.email,
      action: 'auth.reset_password',
      entityType: 'PlatformUser',
      entityId: row.userId,
      ...meta,
    });
  }

  async changePassword(userId: string, currentPassword: string, password: string, sessionId: string, meta: RequestMeta) {
    const user = await this.prisma.platformUser.findUniqueOrThrow({ where: { id: userId } });
    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) {
      throw new BadRequestException({
        code: 'INVALID_CREDENTIALS',
        message: 'Your current password is incorrect.',
        details: { currentPassword: 'Your current password is incorrect.' },
      });
    }

    await this.prisma.$transaction([
      this.prisma.platformUser.update({
        where: { id: userId },
        data: { passwordHash: await argon2.hash(password, { type: argon2.argon2id }) },
      }),
      // Keep the device performing the change signed in; drop the rest.
      this.prisma.platformSession.updateMany({
        where: { userId, revokedAt: null, id: { not: sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: userId,
      actorEmail: user.email,
      action: 'auth.change_password',
      entityType: 'PlatformUser',
      entityId: userId,
      ...meta,
    });
  }

  private async startSession(userId: string, meta: RequestMeta) {
    const { token, hash } = this.tokens.newOpaqueToken();
    const session = await this.prisma.platformSession.create({
      data: {
        userId,
        refreshTokenHash: hash,
        expiresAt: refreshExpiry(this.env.JWT_REFRESH_TTL),
        userAgent: meta.userAgent?.slice(0, 400),
        ipAddress: meta.ip?.slice(0, 64),
      },
      include: { user: { select: { email: true, role: true } } },
    });

    const accessToken = await this.tokens.signAccess({
      sub: userId,
      email: session.user.email,
      role: session.user.role,
      sid: session.id,
    });

    return { accessToken, refreshToken: token };
  }
}

/** Parses "30d" / "12h" / "45m" into an absolute expiry. */
function refreshExpiry(ttl: string) {
  const m = /^(\d+)([smhd])$/.exec(ttl.trim());
  const ms = m
    ? Number(m[1]) * { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd']
    : 30 * 86_400_000;
  return new Date(Date.now() + ms);
}
