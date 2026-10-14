import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';
import type { AccessClaims } from '../auth/token.service';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: PaginationQuery & { status?: any; priority?: any; organizationId?: string }) {
    const where: Prisma.SupportTicketWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      ...(query.search
        ? {
            OR: [
              { subject: { contains: query.search, mode: 'insensitive' } },
              { reference: { contains: query.search, mode: 'insensitive' } },
              { organization: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['createdAt', 'priority', 'status'] as const, query.sortBy, query.sortDir, 'createdAt'),
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          assignedTo: { select: { id: true, name: true } },
          _count: { select: { notes: true } },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return paginate(rows, total, query);
  }

  async get(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true, slug: true, status: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        notes: {
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { id: true, name: true } } },
        },
      },
    });
    if (!ticket) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That ticket does not exist.' });
    return ticket;
  }

  async create(input: { organizationId: string; subject: string; description: string; priority: any }, actor: AccessClaims) {
    const ticket = await this.prisma.$transaction(async (tx) => {
      const count = await tx.supportTicket.count();
      return tx.supportTicket.create({
        data: {
          reference: `TKT-${String(count + 1).padStart(6, '0')}`,
          organizationId: input.organizationId,
          subject: input.subject,
          description: input.description,
          priority: input.priority,
        },
      });
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId: input.organizationId,
      action: 'ticket.create',
      entityType: 'SupportTicket',
      entityId: ticket.id,
      after: { reference: ticket.reference, subject: ticket.subject },
    });

    return this.get(ticket.id);
  }

  async update(id: string, input: { status?: any; priority?: any; assignedToId?: string | null }, actor: AccessClaims) {
    const before = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That ticket does not exist.' });

    const now = new Date();
    await this.prisma.supportTicket.update({
      where: { id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
        ...(input.status === 'RESOLVED' ? { resolvedAt: now } : {}),
        ...(input.status === 'CLOSED' ? { closedAt: now } : {}),
      },
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      organizationId: before.organizationId,
      action: 'ticket.update',
      entityType: 'SupportTicket',
      entityId: id,
      before: { status: before.status, priority: before.priority, assignedToId: before.assignedToId },
      after: input,
    });

    return this.get(id);
  }

  /** Spec §22 — notes default to internal and are never exposed to the tenant. */
  async addNote(ticketId: string, body: string, isInternal: boolean, actor: AccessClaims) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That ticket does not exist.' });

    await this.prisma.ticketNote.create({
      data: { ticketId, authorId: actor.sub, body, isInternal },
    });

    return this.get(ticketId);
  }
}
