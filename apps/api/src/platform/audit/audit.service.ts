import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

export interface AuditEntry {
  actorType: 'PLATFORM' | 'ORG' | 'SYSTEM';
  actorId?: string | null;
  actorEmail?: string | null;
  organizationId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string;
  userAgent?: string;
}

/** Never written to an audit payload, even if a caller passes them in. */
const REDACTED = new Set([
  'password', 'passwordHash', 'currentPassword', 'confirmPassword',
  'token', 'refreshToken', 'accessToken', 'tokenHash', 'refreshTokenHash',
  'mfaSecret', 'invitationToken',
]);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Spec §§24 and 72. Auditing must never break the operation it is recording —
   * a failed write is logged and swallowed, because losing a log line is far less
   * damaging than failing a payment that already succeeded.
   *
   * Pass a transaction client to make the log atomic with the change it describes.
   */
  async record(entry: AuditEntry, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    try {
      await client.auditLog.create({
        data: {
          actorType: entry.actorType,
          actorId: entry.actorId ?? null,
          actorEmail: entry.actorEmail ?? null,
          organizationId: entry.organizationId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          before: sanitize(entry.before),
          after: sanitize(entry.after),
          reason: entry.reason ?? null,
          ipAddress: entry.ip?.slice(0, 64) ?? null,
          userAgent: entry.userAgent?.slice(0, 400) ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log for ${entry.action}`, err as Error);
    }
  }

  async list(query: PaginationQuery & { organizationId?: string; action?: string; entityType?: string }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' } } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.search
        ? {
            OR: [
              { actorEmail: { contains: query.search, mode: 'insensitive' } },
              { action: { contains: query.search, mode: 'insensitive' } },
              { entityId: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['createdAt', 'action', 'actorEmail'] as const, query.sortBy, query.sortDir, 'createdAt'),
        include: { organization: { select: { id: true, name: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(rows, total, query);
  }
}

/** Drops secret-bearing keys and caps depth so a stray object cannot bloat a row. */
function sanitize(value: unknown, depth = 0): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1) ?? null) as Prisma.InputJsonValue;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED.has(k)) continue;
      const s = sanitize(v, depth + 1);
      if (s !== undefined) out[k] = s;
    }
    return out as Prisma.InputJsonValue;
  }
  if (value instanceof Date) return (value as Date).toISOString();
  return value as Prisma.InputJsonValue;
}
