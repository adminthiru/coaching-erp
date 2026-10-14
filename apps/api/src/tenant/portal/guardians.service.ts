import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { addDays } from '@acadia/utils';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';

/**
 * Spec §65 — staff-side management of who can sign in to the portal for a
 * student. A guardian is an OrgUser with role PARENT, invited exactly like a
 * staff member; the link is what grants them sight of this child and no other.
 */
@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, studentId: string) {
    await this.assertStudent(ctx, studentId);

    const rows = await this.prisma.guardian.findMany({
      where: { studentId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, acceptedAt: true, lastLoginAt: true, isActive: true } },
      },
    });

    return rows.map((g) => ({
      id: g.id,
      relation: g.relation,
      isPrimary: g.isPrimary,
      user: g.user,
      status: g.user.acceptedAt ? (g.user.isActive ? 'active' : 'inactive') : 'invited',
    }));
  }

  /**
   * Invites a parent, or links an existing one. A parent with two children here
   * is one login with two links, never two accounts — which is what makes the
   * spec's child switcher possible at all.
   */
  async invite(
    ctx: TenantContext,
    studentId: string,
    input: { name: string; email: string; phone?: string; relation: string; isPrimary?: boolean },
  ) {
    const student = await this.assertStudent(ctx, studentId);

    const existing = await this.prisma.orgUser.findUnique({
      where: { organizationId_email: { organizationId: ctx.organizationId, email: input.email } },
      select: { id: true, role: true, name: true, deletedAt: true },
    });

    if (existing && existing.role !== 'PARENT') {
      throw new BadRequestException({
        code: 'EMAIL_IN_USE',
        message: `${input.email} is already a ${existing.role.toLowerCase().replace(/_/g, ' ')} in this organization.`,
        details: { email: 'That email is already registered to a staff account.' },
      });
    }
    if (existing?.deletedAt) {
      throw new BadRequestException({ code: 'EMAIL_IN_USE', message: 'That email belonged to a removed account. Use another.' });
    }

    const now = new Date();
    const guardian = await this.prisma.$transaction(async (tx) => {
      const user = existing
        ? await tx.orgUser.findUniqueOrThrow({ where: { id: existing.id }, select: { id: true, name: true, email: true } })
        : await tx.orgUser.create({
            data: {
              organizationId: ctx.organizationId,
              name: input.name,
              email: input.email,
              phone: input.phone || null,
              role: 'PARENT',
              invitedAt: now,
              invitationToken: randomBytes(32).toString('base64url'),
              invitationExpiry: addDays(now, 14),
            },
            select: { id: true, name: true, email: true },
          });

      const already = await tx.guardian.findUnique({
        where: { userId_studentId: { userId: user.id, studentId } },
      });
      if (already) {
        throw new BadRequestException({
          code: 'ALREADY_LINKED',
          message: `${user.name} is already a guardian for ${student.name}.`,
        });
      }

      // Exactly one primary contact per student.
      if (input.isPrimary) {
        await tx.guardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
      }

      return tx.guardian.create({
        data: {
          organizationId: ctx.organizationId,
          userId: user.id,
          studentId,
          relation: input.relation,
          isPrimary: input.isPrimary ?? false,
        },
        include: { user: { select: { id: true, name: true, email: true, acceptedAt: true } } },
      });
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'guardian.link', entityType: 'Guardian', entityId: guardian.id,
      after: { studentId, userId: guardian.userId, relation: guardian.relation, reused: Boolean(existing) },
    });

    return guardian;
  }

  /**
   * Unlinks a guardian from this child. The OrgUser survives — they may still be
   * a guardian for a sibling, and removing their login here would silently cut
   * off access to a student nobody asked about.
   */
  async unlink(ctx: TenantContext, studentId: string, guardianId: string) {
    await this.assertStudent(ctx, studentId);

    const guardian = await this.prisma.guardian.findFirst({
      where: { id: guardianId, studentId, organizationId: ctx.organizationId },
    });
    if (!guardian) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That guardian link does not exist.' });

    await this.prisma.guardian.delete({ where: { id: guardianId } });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'guardian.unlink', entityType: 'Guardian', entityId: guardianId,
      before: { studentId, userId: guardian.userId },
    });

    return { unlinked: true };
  }

  private async assertStudent(ctx: TenantContext, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true, branchId: true },
    });
    if (!student) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That student does not exist.' });
    assertBranchAccess(ctx, student.branchId);
    return student;
  }
}
