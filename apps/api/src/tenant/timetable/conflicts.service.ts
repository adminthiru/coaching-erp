import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { formatClock } from '@acadia/utils';
import type { ConflictKind, ScheduleConflict } from '@acadia/types';

export interface SlotCandidate {
  organizationId: string;
  branchId: string;
  batchId: string;
  facultyId: string;
  roomId?: string | null;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  /** Excluded from the search when editing an existing slot. */
  excludeSlotId?: string;
}

export interface SessionCandidate {
  organizationId: string;
  branchId: string;
  batchId: string;
  facultyId: string;
  roomId?: string | null;
  date: Date;
  startMinute: number;
  endMinute: number;
  excludeSessionId?: string;
}

/**
 * Spec §46 — faculty, room, batch and cross-branch faculty conflicts.
 *
 * Overlap is computed in SQL as a half-open interval (`start < otherEnd AND
 * otherStart < end`), so a class ending at 10:00 does not clash with one starting
 * at 10:00. Two recurring slots also only clash if their effective date ranges
 * overlap — last term's timetable must not block this term's.
 *
 * Faculty is checked across the *whole organization*, deliberately ignoring
 * branch scope: a teacher who works at two branches cannot be in both at once,
 * and that is precisely the conflict a branch-local check would miss.
 */
@Injectable()
export class ConflictsService {
  constructor(private readonly prisma: PrismaService) {}

  async forSlot(candidate: SlotCandidate): Promise<ScheduleConflict[]> {
    const { organizationId, dayOfWeek, startMinute, endMinute } = candidate;

    // Time overlap AND effective-window overlap, both half-open on the time axis.
    const timeAndWindow: Prisma.TimetableSlotWhereInput = {
      organizationId,
      dayOfWeek,
      status: 'ACTIVE',
      startMinute: { lt: endMinute },
      endMinute: { gt: startMinute },
      AND: [
        { OR: [{ effectiveTo: null }, { effectiveTo: { gte: candidate.effectiveFrom } }] },
        ...(candidate.effectiveTo ? [{ effectiveFrom: { lte: candidate.effectiveTo } }] : []),
      ],
      ...(candidate.excludeSlotId ? { id: { not: candidate.excludeSlotId } } : {}),
    };

    const include = {
      batch: { select: { name: true } },
      branch: { select: { name: true } },
      subject: { select: { name: true } },
      faculty: { select: { name: true } },
      room: { select: { name: true } },
    } as const;

    const [facultyClashes, roomClashes, batchClashes] = await Promise.all([
      this.prisma.timetableSlot.findMany({
        where: { ...timeAndWindow, facultyId: candidate.facultyId },
        include,
      }),
      candidate.roomId
        ? this.prisma.timetableSlot.findMany({
            where: { ...timeAndWindow, roomId: candidate.roomId },
            include,
          })
        : Promise.resolve([]),
      this.prisma.timetableSlot.findMany({
        where: { ...timeAndWindow, batchId: candidate.batchId },
        include,
      }),
    ]);

    const conflicts: ScheduleConflict[] = [];
    const when = `${formatClock(startMinute)}–${formatClock(endMinute)}`;

    // Two slots can occupy the same weekday and hour in different terms. Naming
    // the window is what makes otherwise identical clash messages distinguishable.
    const window = (s: { effectiveFrom: Date; effectiveTo: Date | null }) => {
      const from = s.effectiveFrom.toISOString().slice(0, 10);
      return s.effectiveTo ? ` (${from} to ${s.effectiveTo.toISOString().slice(0, 10)})` : ` (from ${from})`;
    };

    for (const s of facultyClashes) {
      const crossBranch = s.branchId !== candidate.branchId;
      conflicts.push({
        kind: (crossBranch ? 'FACULTY_CROSS_BRANCH' : 'FACULTY') as ConflictKind,
        message: crossBranch
          ? `${s.faculty.name} is already teaching ${s.batch.name} at ${s.branch.name} at ${when}${window(s)}.`
          : `${s.faculty.name} is already teaching ${s.batch.name} at ${when}${window(s)}.`,
        conflictsWith: describe(s),
      });
    }
    for (const s of roomClashes) {
      conflicts.push({
        kind: 'ROOM' as ConflictKind,
        message: `${s.room?.name ?? 'That room'} is occupied by ${s.batch.name} at ${when}${window(s)}.`,
        conflictsWith: describe(s),
      });
    }
    for (const s of batchClashes) {
      conflicts.push({
        kind: 'BATCH' as ConflictKind,
        message: `${s.batch.name} already has ${s.subject.name} at ${when}${window(s)}.`,
        conflictsWith: describe(s),
      });
    }

    return dedupe(conflicts);
  }

  /** The same four checks against dated sessions, for a one-off or rescheduled class. */
  async forSession(candidate: SessionCandidate): Promise<ScheduleConflict[]> {
    const base: Prisma.ClassSessionWhereInput = {
      organizationId: candidate.organizationId,
      date: candidate.date,
      status: { not: 'CANCELLED' },
      startMinute: { lt: candidate.endMinute },
      endMinute: { gt: candidate.startMinute },
      ...(candidate.excludeSessionId ? { id: { not: candidate.excludeSessionId } } : {}),
    };

    const include = {
      batch: { select: { name: true } },
      branch: { select: { name: true } },
      subject: { select: { name: true } },
      faculty: { select: { name: true } },
      room: { select: { name: true } },
    } as const;

    const [facultyClashes, roomClashes, batchClashes] = await Promise.all([
      this.prisma.classSession.findMany({ where: { ...base, facultyId: candidate.facultyId }, include }),
      candidate.roomId
        ? this.prisma.classSession.findMany({ where: { ...base, roomId: candidate.roomId }, include })
        : Promise.resolve([]),
      this.prisma.classSession.findMany({ where: { ...base, batchId: candidate.batchId }, include }),
    ]);

    const when = `${formatClock(candidate.startMinute)}–${formatClock(candidate.endMinute)}`;
    const conflicts: ScheduleConflict[] = [];

    for (const s of facultyClashes) {
      const crossBranch = s.branchId !== candidate.branchId;
      conflicts.push({
        kind: (crossBranch ? 'FACULTY_CROSS_BRANCH' : 'FACULTY') as ConflictKind,
        message: crossBranch
          ? `${s.faculty.name} already has a class with ${s.batch.name} at ${s.branch.name} at ${when}.`
          : `${s.faculty.name} already has a class with ${s.batch.name} at ${when}.`,
        conflictsWith: describeSession(s),
      });
    }
    for (const s of roomClashes) {
      conflicts.push({
        kind: 'ROOM' as ConflictKind,
        message: `${s.room?.name ?? 'That room'} is occupied by ${s.batch.name} at ${when}.`,
        conflictsWith: describeSession(s),
      });
    }
    for (const s of batchClashes) {
      conflicts.push({
        kind: 'BATCH' as ConflictKind,
        message: `${s.batch.name} already has ${s.subject.name} at ${when}.`,
        conflictsWith: describeSession(s),
      });
    }

    return dedupe(conflicts);
  }
}

type SlotRow = {
  id: string; dayOfWeek: number; startMinute: number; endMinute: number;
  effectiveFrom: Date; effectiveTo: Date | null;
  batch: { name: string }; branch: { name: string }; subject: { name: string };
  faculty: { name: string }; room: { name: string } | null;
};

type SessionRow = Omit<SlotRow, 'dayOfWeek' | 'effectiveFrom' | 'effectiveTo'> & { date: Date };

function describe(s: SlotRow) {
  return {
    id: s.id,
    batchName: s.batch.name,
    branchName: s.branch.name,
    subjectName: s.subject.name,
    facultyName: s.faculty.name,
    roomName: s.room?.name ?? null,
    dayOfWeek: s.dayOfWeek,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
  };
}

function describeSession(s: SessionRow) {
  return {
    id: s.id,
    batchName: s.batch.name,
    branchName: s.branch.name,
    subjectName: s.subject.name,
    facultyName: s.faculty.name,
    roomName: s.room?.name ?? null,
    date: s.date.toISOString().slice(0, 10),
    startMinute: s.startMinute,
    endMinute: s.endMinute,
  };
}

/**
 * One slot can trip several checks at once — the same faculty, room and batch
 * repeated back is noise. Keep the first (most specific) reason per clashing row.
 */
function dedupe(conflicts: ScheduleConflict[]) {
  const seen = new Set<string>();
  return conflicts.filter((c) => {
    const key = `${c.conflictsWith.id}:${c.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
