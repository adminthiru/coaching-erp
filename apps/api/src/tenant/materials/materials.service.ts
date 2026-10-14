import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

const INCLUDE = {
  subject: { select: { id: true, name: true, code: true } },
  batch: { select: { id: true, name: true, code: true, branchId: true } },
  createdBy: { select: { id: true, name: true } },
  targets: { include: { branch: { select: { id: true, name: true, code: true } } } },
  students: { include: { student: { select: { id: true, name: true, studentCode: true } } } },
} as const;

/** Spec §60 — study materials, scoped from organization-wide down to a named student. */
@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private visibility(ctx: TenantContext): Prisma.StudyMaterialWhereInput {
    const reachable = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.accessibleBranchIds;
    if (reachable === null) return {};
    return {
      OR: [
        { audience: 'ORGANIZATION' },
        { targets: { some: { branchId: { in: reachable } } } },
        { batch: { branchId: { in: reachable } } },
        { students: { some: { student: { branchId: { in: reachable } } } } },
      ],
    };
  }

  async list(ctx: TenantContext, query: PaginationQuery & { subjectId?: string; includeArchived?: boolean }) {
    const where: Prisma.StudyMaterialWhereInput = {
      organizationId: ctx.organizationId,
      ...this.visibility(ctx),
      ...(query.includeArchived ? {} : { isArchived: false }),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.studyMaterial.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['createdAt', 'title'] as const, query.sortBy, query.sortDir, 'createdAt'),
        include: INCLUDE,
      }),
      this.prisma.studyMaterial.count({ where }),
    ]);

    return paginate(rows.map(shape), total, query);
  }

  async get(ctx: TenantContext, id: string) {
    const material = await this.prisma.studyMaterial.findFirst({
      where: { id, organizationId: ctx.organizationId, ...this.visibility(ctx) },
      include: INCLUDE,
    });
    if (!material) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That material does not exist.' });
    return shape(material);
  }

  async create(ctx: TenantContext, input: any) {
    if (input.audience === 'ORGANIZATION' && ctx.accessibleBranchIds !== null) {
      throw new BadRequestException({
        code: 'FORBIDDEN',
        message: 'Only organization-level roles can publish a material to every branch.',
      });
    }

    const { branchIds, batch, students } = await this.resolveAudience(ctx, input);

    const material = await this.prisma.studyMaterial.create({
      data: {
        organizationId: ctx.organizationId,
        title: input.title,
        description: input.description || null,
        subjectId: input.subjectId || null,
        audience: input.audience,
        fileUrl: input.fileUrl,
        batchId: batch?.id ?? null,
        createdById: ctx.userId,
        targets: { create: branchIds.map((branchId: string) => ({ branchId })) },
        students: { create: students.map((s: { id: string }) => ({ studentId: s.id })) },
      },
      include: INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'material.create', entityType: 'StudyMaterial', entityId: material.id,
      after: { title: material.title, audience: material.audience },
    });

    return shape(material);
  }

  async archive(ctx: TenantContext, id: string) {
    const material = await this.get(ctx, id);
    if (material.isArchived) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: 'This material is already archived.' });
    }

    await this.prisma.studyMaterial.update({ where: { id }, data: { isArchived: true } });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'material.archive', entityType: 'StudyMaterial', entityId: id,
    });

    return this.get(ctx, id);
  }

  private async resolveAudience(ctx: TenantContext, input: any) {
    let branchIds: string[] = [];
    let batch: { id: string; branchId: string } | null = null;
    let students: { id: string; branchId: string }[] = [];

    if (input.audience === 'ORGANIZATION') {
      return { branchIds, batch, students };
    }

    if (input.audience === 'BATCH') {
      const found = await this.prisma.batch.findFirst({
        where: { id: input.batchId, organizationId: ctx.organizationId },
        select: { id: true, branchId: true },
      });
      if (!found) {
        throw new BadRequestException({ code: 'NOT_FOUND', message: 'That batch does not exist.', details: { batchId: 'Pick a batch.' } });
      }
      assertBranchAccess(ctx, found.branchId);
      batch = found;
    } else if (input.audience === 'BRANCH' || input.audience === 'MULTI_BRANCH') {
      const requested: string[] = input.branchIds?.length
        ? input.branchIds
        : ctx.activeBranchId
          ? [ctx.activeBranchId]
          : [];
      if (!requested.length) {
        throw new BadRequestException({
          code: 'BRANCH_REQUIRED',
          message: 'Choose at least one branch, or switch out of the all-branch view.',
          details: { branchIds: 'Pick a branch.' },
        });
      }
      for (const id of requested) assertBranchAccess(ctx, id);
      const found = await this.prisma.branch.count({ where: { id: { in: requested }, organizationId: ctx.organizationId } });
      if (found !== requested.length) {
        throw new BadRequestException({ code: 'NOT_FOUND', message: 'One or more selected branches do not exist.' });
      }
      branchIds = requested;
    } else if (input.audience === 'STUDENTS') {
      const found = await this.prisma.student.findMany({
        where: { id: { in: input.studentIds }, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, branchId: true },
      });
      if (found.length !== input.studentIds.length) {
        throw new BadRequestException({ code: 'NOT_FOUND', message: 'One or more selected students do not exist.', details: { studentIds: 'Pick valid students.' } });
      }
      for (const s of found) assertBranchAccess(ctx, s.branchId);
      students = found;
    }

    return { branchIds, batch, students };
  }
}

function shape<T extends {
  targets: { branch: { id: string; name: string; code: string } }[];
  students: { student: { id: string; name: string; studentCode: string } }[];
}>(material: T) {
  const { targets, students, ...rest } = material;
  return { ...rest, targets: targets.map((t) => t.branch), students: students.map((s) => s.student) };
}
