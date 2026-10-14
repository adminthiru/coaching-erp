import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, branchScope, type TenantContext } from '../scope/tenant-context';

const INCLUDE = {
  batch: { select: { id: true, name: true, code: true } },
  subject: { select: { id: true, name: true, code: true } },
  faculty: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, code: true } },
  topics: { include: { topic: { select: { id: true, name: true } } } },
} as const;

/** Spec §44 — lesson, revision, practice and test plans. */
@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, filter: { batchId?: string; type?: any; from?: string; to?: string }) {
    const where: Prisma.LessonPlanWhereInput = {
      organizationId: ctx.organizationId,
      ...branchScope(ctx),
      ...(filter.batchId ? { batchId: filter.batchId } : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.from || filter.to
        ? {
            plannedDate: {
              ...(filter.from ? { gte: new Date(`${filter.from}T00:00:00.000Z`) } : {}),
              ...(filter.to ? { lte: new Date(`${filter.to}T00:00:00.000Z`) } : {}),
            },
          }
        : {}),
    };

    const plans = await this.prisma.lessonPlan.findMany({
      where,
      orderBy: [{ plannedDate: 'asc' }],
      include: INCLUDE,
    });

    return plans.map((p) => ({ ...p, topics: p.topics.map((t) => t.topic) }));
  }

  async create(ctx: TenantContext, input: any) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: input.batchId, organizationId: ctx.organizationId },
      select: { id: true, branchId: true, status: true, name: true },
    });
    if (!batch) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That batch does not exist.', details: { batchId: 'Pick a batch.' } });
    }
    assertBranchAccess(ctx, batch.branchId);

    const subject = await this.prisma.subject.findFirst({
      where: { id: input.subjectId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!subject) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That subject does not exist.', details: { subjectId: 'Pick a subject.' } });
    }

    // Topics must belong to the subject being planned, or the plan is incoherent.
    if (input.topicIds?.length) {
      const valid = await this.prisma.topic.count({
        where: {
          id: { in: input.topicIds },
          organizationId: ctx.organizationId,
          chapter: { subjectId: input.subjectId },
        },
      });
      if (valid !== input.topicIds.length) {
        throw new BadRequestException({
          code: 'TOPIC_MISMATCH',
          message: 'Some selected topics do not belong to this subject.',
          details: { topicIds: 'Pick topics from the chosen subject.' },
        });
      }
    }

    const plan = await this.prisma.lessonPlan.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: batch.branchId,
        batchId: batch.id,
        subjectId: subject.id,
        facultyId: input.facultyId ?? null,
        type: input.type,
        status: input.status,
        title: input.title,
        description: input.description || null,
        plannedDate: new Date(`${input.plannedDate}T00:00:00.000Z`),
        durationMinutes: input.durationMinutes,
        topics: { create: (input.topicIds ?? []).map((topicId: string) => ({ topicId })) },
      },
      include: INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'lesson_plan.create', entityType: 'LessonPlan', entityId: plan.id,
      after: { title: plan.title, type: plan.type, batchId: batch.id },
    });

    return { ...plan, topics: plan.topics.map((t) => t.topic) };
  }

  async update(ctx: TenantContext, id: string, input: any) {
    const existing = await this.prisma.lessonPlan.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That plan does not exist.' });
    assertBranchAccess(ctx, existing.branchId);

    const data: Prisma.LessonPlanUpdateInput = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.plannedDate !== undefined ? { plannedDate: new Date(`${input.plannedDate}T00:00:00.000Z`) } : {}),
      ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.facultyId !== undefined ? { faculty: input.facultyId ? { connect: { id: input.facultyId } } : { disconnect: true } } : {}),
    };

    const plan = await this.prisma.$transaction(async (tx) => {
      if (input.topicIds !== undefined) {
        await tx.lessonPlanTopic.deleteMany({ where: { planId: id } });
        if (input.topicIds.length) {
          await tx.lessonPlanTopic.createMany({
            data: input.topicIds.map((topicId: string) => ({ planId: id, topicId })),
          });
        }
      }
      return tx.lessonPlan.update({ where: { id }, data, include: INCLUDE });
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'lesson_plan.update', entityType: 'LessonPlan', entityId: id, after: input,
    });

    return { ...plan, topics: plan.topics.map((t) => t.topic) };
  }
}
