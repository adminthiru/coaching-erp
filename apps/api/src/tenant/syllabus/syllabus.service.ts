import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, branchScope, type TenantContext } from '../scope/tenant-context';

/**
 * Spec §43 — syllabus and completion tracking.
 *
 * The chapter/topic tree is organization-wide; *progress* through it is per batch,
 * so two branches running the same course can be at different points without one
 * overwriting the other.
 */
@Injectable()
export class SyllabusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ── The tree (spec §42) ──────────────────────────────────────────────── */

  async tree(ctx: TenantContext, subjectId?: string) {
    const subjects = await this.prisma.subject.findMany({
      where: {
        organizationId: ctx.organizationId,
        isActive: true,
        ...(subjectId ? { id: subjectId } : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        course: { select: { id: true, name: true } },
        chapters: {
          where: { isActive: true },
          orderBy: [{ sequence: 'asc' }, { name: 'asc' }],
          include: {
            topics: {
              where: { isActive: true },
              orderBy: [{ sequence: 'asc' }, { name: 'asc' }],
            },
          },
        },
      },
    });

    return subjects.map((s) => ({
      ...s,
      topicCount: s.chapters.reduce((n, c) => n + c.topics.length, 0),
      estimatedHours: s.chapters.reduce(
        (n, c) => n + c.topics.reduce((t, topic) => t + topic.estimatedHours, 0),
        0,
      ),
    }));
  }

  async createChapter(ctx: TenantContext, input: any) {
    await this.assertSubject(ctx, input.subjectId);
    const chapter = await this.prisma.chapter.create({
      data: {
        organizationId: ctx.organizationId,
        subjectId: input.subjectId,
        name: input.name,
        sequence: input.sequence,
        description: input.description || null,
        estimatedHours: input.estimatedHours,
        isActive: input.isActive,
      },
      include: { topics: true },
    });
    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'chapter.create', entityType: 'Chapter', entityId: chapter.id,
      after: { name: chapter.name, subjectId: input.subjectId },
    });
    return chapter;
  }

  async createTopic(ctx: TenantContext, input: any) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { id: input.chapterId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!chapter) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That chapter does not exist.', details: { chapterId: 'Pick a chapter.' } });
    }

    return this.prisma.topic.create({
      data: {
        organizationId: ctx.organizationId,
        chapterId: input.chapterId,
        name: input.name,
        sequence: input.sequence,
        estimatedHours: input.estimatedHours,
        isActive: input.isActive,
      },
    });
  }

  /** Reordering sends the full ordered list, so sequence numbers stay dense. */
  async reorderTopics(ctx: TenantContext, chapterId: string, ids: string[]) {
    const topics = await this.prisma.topic.findMany({
      where: { chapterId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    const known = new Set(topics.map((t) => t.id));
    if (ids.length !== topics.length || ids.some((id) => !known.has(id))) {
      throw new BadRequestException({
        code: 'REORDER_MISMATCH',
        message: 'Send every topic in the chapter, exactly once.',
      });
    }

    await this.prisma.$transaction(
      ids.map((id, index) => this.prisma.topic.update({ where: { id }, data: { sequence: index } })),
    );
    return { reordered: ids.length };
  }

  /* ── Per-batch progress (spec §43) ────────────────────────────────────── */

  /**
   * Seeds a batch's tracker from the topics of the subjects actually taught to it.
   * Idempotent — re-running adds newly created topics without disturbing progress
   * already recorded.
   */
  async initialise(ctx: TenantContext, batchId: string, subjectIds?: string[]) {
    const batch = await this.loadBatch(ctx, batchId);

    // Default to the subjects this batch has faculty for; fall back to its course.
    const taught = await this.prisma.batchFaculty.findMany({
      where: { batchId, endedAt: null },
      select: { subjectId: true },
    });
    const targetSubjects =
      subjectIds?.length
        ? subjectIds
        : taught.length
          ? [...new Set(taught.map((t) => t.subjectId))]
          : (
              await this.prisma.subject.findMany({
                where: { organizationId: ctx.organizationId, isActive: true, OR: [{ courseId: batch.courseId }, { courseId: null }] },
                select: { id: true },
              })
            ).map((s) => s.id);

    if (!targetSubjects.length) {
      throw new BadRequestException({
        code: 'NO_SUBJECTS',
        message: 'Assign faculty and subjects to this batch first.',
      });
    }

    const topics = await this.prisma.topic.findMany({
      where: {
        organizationId: ctx.organizationId,
        isActive: true,
        chapter: { subjectId: { in: targetSubjects }, isActive: true },
      },
      select: { id: true },
    });
    if (!topics.length) {
      throw new BadRequestException({
        code: 'NO_TOPICS',
        message: 'These subjects have no chapters or topics yet.',
      });
    }

    const result = await this.prisma.syllabusProgress.createMany({
      data: topics.map((t) => ({
        organizationId: ctx.organizationId,
        branchId: batch.branchId,
        batchId,
        topicId: t.id,
      })),
      skipDuplicates: true,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'syllabus.initialise', entityType: 'Batch', entityId: batchId,
      after: { topicsAdded: result.count, subjects: targetSubjects.length },
    });

    return {
      added: result.count,
      alreadyTracked: topics.length - result.count,
      message: `${result.count} topic${result.count === 1 ? '' : 's'} added to the tracker.`,
    };
  }

  /** Progress for one batch, grouped by subject then chapter, with completion. */
  async forBatch(ctx: TenantContext, batchId: string) {
    const batch = await this.loadBatch(ctx, batchId);

    const rows = await this.prisma.syllabusProgress.findMany({
      where: { batchId, organizationId: ctx.organizationId },
      include: {
        faculty: { select: { id: true, name: true } },
        topic: {
          include: {
            chapter: {
              select: {
                id: true, name: true, sequence: true,
                subject: { select: { id: true, name: true, code: true } },
              },
            },
          },
        },
      },
    });

    const subjects = new Map<string, {
      subject: { id: string; name: string; code: string };
      chapters: Map<string, { id: string; name: string; sequence: number; topics: typeof rows }>;
    }>();

    for (const row of rows) {
      const subj = row.topic.chapter.subject;
      if (!subjects.has(subj.id)) subjects.set(subj.id, { subject: subj, chapters: new Map() });
      const entry = subjects.get(subj.id)!;
      const ch = row.topic.chapter;
      if (!entry.chapters.has(ch.id)) {
        entry.chapters.set(ch.id, { id: ch.id, name: ch.name, sequence: ch.sequence, topics: [] });
      }
      entry.chapters.get(ch.id)!.topics.push(row);
    }

    const shaped = [...subjects.values()].map((entry) => {
      const chapters = [...entry.chapters.values()]
        .sort((a, b) => a.sequence - b.sequence)
        .map((c) => ({
          ...c,
          topics: c.topics.sort((a, b) => a.topic.sequence - b.topic.sequence),
          ...completion(c.topics),
        }));
      const all = chapters.flatMap((c) => c.topics);
      return { subject: entry.subject, chapters, ...completion(all) };
    });

    return {
      batch: { id: batch.id, name: batch.name, code: batch.code },
      subjects: shaped.sort((a, b) => a.subject.name.localeCompare(b.subject.name)),
      overall: completion(rows),
      tracked: rows.length,
    };
  }

  async updateProgress(ctx: TenantContext, id: string, input: any) {
    const row = await this.prisma.syllabusProgress.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { topic: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That topic is not tracked for this batch.' });
    assertBranchAccess(ctx, row.branchId);

    // Completing a topic stamps today unless a date was given, so the common case
    // needs no extra input; reopening one clears the stamp.
    const completedDate =
      input.status === 'COMPLETED'
        ? input.completedDate
          ? new Date(input.completedDate)
          : row.completedDate ?? new Date()
        : null;

    const updated = await this.prisma.syllabusProgress.update({
      where: { id },
      data: {
        status: input.status,
        plannedDate: input.plannedDate === undefined ? row.plannedDate : input.plannedDate ? new Date(input.plannedDate) : null,
        completedDate,
        facultyId: input.facultyId === undefined ? row.facultyId : input.facultyId,
        notes: input.notes === undefined ? row.notes : input.notes || null,
      },
      include: { topic: { select: { id: true, name: true } }, faculty: { select: { id: true, name: true } } },
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'syllabus.update', entityType: 'SyllabusProgress', entityId: id,
      before: { status: row.status }, after: { status: input.status, topic: row.topic.name },
    });

    return updated;
  }

  private async loadBatch(ctx: TenantContext, batchId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, organizationId: ctx.organizationId },
      select: { id: true, name: true, code: true, branchId: true, courseId: true },
    });
    if (!batch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That batch does not exist.' });
    assertBranchAccess(ctx, batch.branchId);
    return batch;
  }

  private async assertSubject(ctx: TenantContext, subjectId: string) {
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!subject) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That subject does not exist.', details: { subjectId: 'Pick a subject.' } });
    }
  }
}

/** Skipped topics are excluded from the denominator — they are not outstanding work. */
function completion(rows: { status: string }[]) {
  const total = rows.length;
  const completed = rows.filter((r) => r.status === 'COMPLETED').length;
  const inProgress = rows.filter((r) => r.status === 'IN_PROGRESS').length;
  const skipped = rows.filter((r) => r.status === 'SKIPPED').length;
  const countable = total - skipped;
  return {
    total,
    completed,
    inProgress,
    skipped,
    percent: countable === 0 ? 0 : (completed / countable) * 100,
  };
}
