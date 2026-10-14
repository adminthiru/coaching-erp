import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { hashToken, TenantTokenService } from './tenant-token.service';
import { loadEnv } from '../../common/config/env';
import { addDays } from '@acadia/utils';

const MAX_FAILED = 8;

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class TenantAuthService {
  private readonly logger = new Logger(TenantAuthService.name);
  private readonly env = loadEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TenantTokenService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, meta: RequestMeta) {
    const invalid = () =>
      new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });

    // Email is unique per organization, not globally, so a person can legitimately
    // exist in more than one tenant. Sign in to the first usable one; a tenant
    // picker follows if that becomes common.
    const users = await this.prisma.orgUser.findMany({
      where: { email, deletedAt: null, isActive: true },
      include: {
        organization: { select: { id: true, name: true, slug: true, status: true } },
        branches: { where: { endedAt: null }, select: { branchId: true, isPrimary: true } },
      },
    });

    const user = users.find((u) => ['TRIAL', 'ACTIVE', 'PAYMENT_DUE'].includes(u.organization.status)) ?? users[0];

    if (!user || !user.passwordHash) {
      await argon2.hash('timing-equalizer');
      throw invalid();
    }
    if (!['TRIAL', 'ACTIVE', 'PAYMENT_DUE'].includes(user.organization.status)) {
      throw new UnauthorizedException({
        code: 'ORGANIZATION_INACTIVE',
        message: 'This organization is not active. Contact support.',
      });
    }

    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) throw invalid();

    const primary = user.branches.find((b) => b.isPrimary) ?? user.branches[0];
    const session = await this.startSession(user.id, primary?.branchId ?? null, meta);

    await this.prisma.orgUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { lastActiveAt: new Date() },
    });

    await this.audit.record({
      actorType: 'ORG',
      actorId: user.id,
      actorEmail: user.email,
      organizationId: user.organizationId,
      action: 'auth.login',
      entityType: 'OrgUser',
      entityId: user.id,
      ...meta,
    });

    return {
      ...session,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organization: user.organization,
      },
    };
  }

  async refresh(refreshToken: string, meta: RequestMeta) {
    const session = await this.prisma.orgSession.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
      include: { user: { include: { organization: { select: { id: true, name: true, slug: true, status: true } } } } },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException({ code: 'REFRESH_INVALID', message: 'Please sign in again.' });
    }
    if (!session.user.isActive || session.user.deletedAt) {
      throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Your account is no longer active.' });
    }

    const next = this.tokens.newOpaqueToken();
    await this.prisma.orgSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: next.hash,
        lastUsedAt: new Date(),
        expiresAt: addDays(new Date(), 30),
        userAgent: meta.userAgent ?? session.userAgent,
        ipAddress: meta.ip ?? session.ipAddress,
      },
    });

    const accessToken = await this.tokens.signAccess({
      sub: session.user.id,
      email: session.user.email,
      org: session.user.organizationId,
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
        organization: session.user.organization,
      },
    };
  }

  async logout(sessionId: string) {
    await this.prisma.orgSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Persists the branch selection so it survives a reload. Access was already
   * proved by the guard; this only records the choice.
   */
  async setActiveBranch(sessionId: string, branchId: string | null) {
    await this.prisma.orgSession.update({
      where: { id: sessionId },
      data: { activeBranchId: branchId },
    });
  }

  /** Spec §25 — the owner accepts their invitation and sets a password. */
  async acceptInvitation(token: string, password: string, meta: RequestMeta) {
    const user = await this.prisma.orgUser.findUnique({
      where: { invitationToken: token },
      include: {
        organization: { select: { id: true, name: true, slug: true, status: true } },
        branches: { where: { endedAt: null }, select: { branchId: true, isPrimary: true } },
      },
    });

    if (!user || user.acceptedAt || !user.invitationExpiry || user.invitationExpiry < new Date()) {
      throw new BadRequestException({
        code: 'INVITATION_INVALID',
        message: 'That invitation link has expired. Ask for a new one.',
      });
    }

    await this.prisma.orgUser.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        acceptedAt: new Date(),
        invitationToken: null,
        invitationExpiry: null,
      },
    });

    await this.audit.record({
      actorType: 'ORG',
      actorId: user.id,
      actorEmail: user.email,
      organizationId: user.organizationId,
      action: 'auth.accept_invitation',
      entityType: 'OrgUser',
      entityId: user.id,
      ...meta,
    });

    const primary = user.branches.find((b) => b.isPrimary) ?? user.branches[0];
    const session = await this.startSession(user.id, primary?.branchId ?? null, meta);

    return {
      ...session,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organization: user.organization,
      },
    };
  }

  /** Returns the invitation details behind a token, so the page can greet the user. */
  async inspectInvitation(token: string) {
    const user = await this.prisma.orgUser.findUnique({
      where: { invitationToken: token },
      select: {
        name: true, email: true, role: true, acceptedAt: true, invitationExpiry: true,
        organization: { select: { name: true } },
      },
    });

    if (!user || user.acceptedAt || !user.invitationExpiry || user.invitationExpiry < new Date()) {
      throw new BadRequestException({
        code: 'INVITATION_INVALID',
        message: 'That invitation link has expired. Ask for a new one.',
      });
    }

    return {
      name: user.name,
      email: user.email,
      role: user.role,
      organizationName: user.organization.name,
      expiresAt: user.invitationExpiry,
    };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.orgUser.findFirst({
      where: { email, deletedAt: null, isActive: true },
    });
    if (!user) return { sent: true as const };

    const raw = randomBytes(32).toString('base64url');
    await this.prisma.orgPasswordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 3_600_000) },
    });

    this.logger.warn(`Tenant password reset requested for ${user.email} (no mailer configured yet)`);
    return this.env.NODE_ENV === 'development' ? { sent: true as const, token: raw } : { sent: true as const };
  }

  async resetPassword(token: string, password: string) {
    const row = await this.prisma.orgPasswordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!row || row.usedAt || row.expiresAt <= new Date()) {
      throw new BadRequestException({ code: 'TOKEN_INVALID', message: 'That reset link has expired.' });
    }

    await this.prisma.$transaction([
      this.prisma.orgUser.update({
        where: { id: row.userId },
        data: { passwordHash: await argon2.hash(password, { type: argon2.argon2id }) },
      }),
      this.prisma.orgPasswordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      // A reset is the usual response to a compromise; live devices must not survive it.
      this.prisma.orgSession.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async startSession(userId: string, branchId: string | null, meta: RequestMeta) {
    const { token, hash } = this.tokens.newOpaqueToken();
    const session = await this.prisma.orgSession.create({
      data: {
        userId,
        refreshTokenHash: hash,
        activeBranchId: branchId,
        expiresAt: addDays(new Date(), 30),
        userAgent: meta.userAgent?.slice(0, 400),
        ipAddress: meta.ip?.slice(0, 64),
      },
      include: { user: { select: { email: true, role: true, organizationId: true } } },
    });

    const accessToken = await this.tokens.signAccess({
      sub: userId,
      email: session.user.email,
      org: session.user.organizationId,
      role: session.user.role,
      sid: session.id,
    });

    return { accessToken, refreshToken: token };
  }
}
