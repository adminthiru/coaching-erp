import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AccessClaims } from '../auth/token.service';
import type { PlatformRole } from '@prisma/client';

const SAFE_FIELDS = {
  id: true, name: true, email: true, phone: true, role: true, isActive: true,
  mfaEnabled: true, lastLoginAt: true, createdAt: true,
} as const;

@Injectable()
export class PlatformUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.platformUser.findMany({
      where: { deletedAt: null },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: SAFE_FIELDS,
    });
  }

  async create(
    input: { name: string; email: string; phone?: string; role: PlatformRole; password: string },
    actor: AccessClaims,
  ) {
    const existing = await this.prisma.platformUser.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: 'That email address is already registered.',
        details: { email: 'That email address is already registered.' },
      });
    }

    const user = await this.prisma.platformUser.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        role: input.role,
        passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
      },
      select: SAFE_FIELDS,
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      action: 'platform_user.create',
      entityType: 'PlatformUser',
      entityId: user.id,
      after: { name: user.name, email: user.email, role: user.role },
    });

    return user;
  }

  async setActive(id: string, isActive: boolean, actor: AccessClaims) {
    // Locking yourself out is always a mistake, never an intention.
    if (id === actor.sub && !isActive) {
      throw new BadRequestException({ code: 'SELF_DEACTIVATE', message: 'You cannot deactivate your own account.' });
    }

    const user = await this.prisma.platformUser.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That user does not exist.' });

    // The platform must always retain at least one active owner.
    if (!isActive && user.role === 'PLATFORM_OWNER') {
      const owners = await this.prisma.platformUser.count({
        where: { role: 'PLATFORM_OWNER', isActive: true, deletedAt: null },
      });
      if (owners <= 1) {
        throw new BadRequestException({
          code: 'LAST_OWNER',
          message: 'This is the only active Platform Owner. Promote another before deactivating this one.',
        });
      }
    }

    await this.prisma.$transaction([
      this.prisma.platformUser.update({ where: { id }, data: { isActive } }),
      // Deactivation must take effect immediately, not at token expiry.
      ...(isActive
        ? []
        : [this.prisma.platformSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })]),
    ]);

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      action: isActive ? 'platform_user.activate' : 'platform_user.deactivate',
      entityType: 'PlatformUser',
      entityId: id,
    });

    return this.prisma.platformUser.findUniqueOrThrow({ where: { id }, select: SAFE_FIELDS });
  }

  async changeRole(id: string, role: PlatformRole, actor: AccessClaims) {
    const user = await this.prisma.platformUser.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That user does not exist.' });

    if (user.role === 'PLATFORM_OWNER' && role !== 'PLATFORM_OWNER') {
      const owners = await this.prisma.platformUser.count({
        where: { role: 'PLATFORM_OWNER', isActive: true, deletedAt: null },
      });
      if (owners <= 1) {
        throw new BadRequestException({
          code: 'LAST_OWNER',
          message: 'This is the only Platform Owner. Promote another before changing this role.',
        });
      }
    }

    await this.prisma.platformUser.update({ where: { id }, data: { role } });
    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      action: 'platform_user.change_role',
      entityType: 'PlatformUser',
      entityId: id,
      before: { role: user.role },
      after: { role },
    });

    return this.prisma.platformUser.findUniqueOrThrow({ where: { id }, select: SAFE_FIELDS });
  }
}
