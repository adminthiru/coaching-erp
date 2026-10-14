import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Coupon } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery, UpsertCouponInput } from '@acadia/validation';
import type { AccessClaims } from '../auth/token.service';

@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: PaginationQuery & { isActive?: boolean }) {
    const where: Prisma.CouponWhereInput = {
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search.toUpperCase() } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['code', 'createdAt', 'redemptionCount'] as const, query.sortBy, query.sortDir, 'createdAt'),
        include: { plans: { include: { plan: { select: { id: true, name: true } } } } },
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return paginate(rows.map(shape), total, query);
  }

  async get(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: {
        plans: { include: { plan: { select: { id: true, name: true } } } },
        redemptions: {
          orderBy: { redeemedAt: 'desc' },
          take: 50,
          include: { organization: { select: { id: true, name: true } } },
        },
      },
    });
    if (!coupon) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That coupon does not exist.' });
    return { ...shape(coupon), redemptions: coupon.redemptions };
  }

  async create(input: UpsertCouponInput, actor: AccessClaims) {
    // Codes are unique platform-wide; the unique index is the real guard, this
    // check only produces a friendlier message than a constraint violation.
    const existing = await this.prisma.coupon.findUnique({ where: { code: input.code } });
    if (existing) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: `The code ${input.code} is already in use.`,
        details: { code: 'That code is already in use.' },
      });
    }

    await this.assertPlansExist(input.planIds);

    const coupon = await this.prisma.coupon.create({
      data: {
        code: input.code,
        description: input.description || null,
        type: input.type,
        duration: input.duration,
        value: Math.round(input.value),
        maxRedemptions: input.maxRedemptions,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validUntil: input.validUntil ? new Date(`${input.validUntil}T23:59:59.999Z`) : null,
        isActive: input.isActive,
        plans: { create: input.planIds.map((planId) => ({ planId })) },
      },
    });

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      action: 'coupon.create',
      entityType: 'Coupon',
      entityId: coupon.id,
      after: input,
    });

    return this.get(coupon.id);
  }

  async update(id: string, input: UpsertCouponInput, actor: AccessClaims) {
    const before = await this.prisma.coupon.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That coupon does not exist.' });

    if (input.code !== before.code) {
      const clash = await this.prisma.coupon.findUnique({ where: { code: input.code } });
      if (clash) {
        throw new BadRequestException({
          code: 'DUPLICATE',
          message: `The code ${input.code} is already in use.`,
          details: { code: 'That code is already in use.' },
        });
      }
    }

    // Lowering the cap below what has already been redeemed would make the
    // counter permanently invalid.
    if (input.maxRedemptions !== null && input.maxRedemptions < before.redemptionCount) {
      throw new BadRequestException({
        code: 'INVALID_LIMIT',
        message: `This coupon has already been redeemed ${before.redemptionCount} times.`,
        details: { maxRedemptions: `Must be at least ${before.redemptionCount}.` },
      });
    }

    await this.assertPlansExist(input.planIds);

    await this.prisma.$transaction([
      this.prisma.couponPlan.deleteMany({ where: { couponId: id } }),
      this.prisma.coupon.update({
        where: { id },
        data: {
          code: input.code,
          description: input.description || null,
          type: input.type,
          duration: input.duration,
          value: Math.round(input.value),
          maxRedemptions: input.maxRedemptions,
          validFrom: input.validFrom ? new Date(input.validFrom) : null,
          validUntil: input.validUntil ? new Date(`${input.validUntil}T23:59:59.999Z`) : null,
          isActive: input.isActive,
          plans: { create: input.planIds.map((planId) => ({ planId })) },
        },
      }),
    ]);

    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      action: 'coupon.update',
      entityType: 'Coupon',
      entityId: id,
      before: { code: before.code, value: before.value, isActive: before.isActive },
      after: input,
    });

    return this.get(id);
  }

  async setActive(id: string, isActive: boolean, actor: AccessClaims) {
    await this.prisma.coupon.update({ where: { id }, data: { isActive } });
    await this.audit.record({
      actorType: 'PLATFORM',
      actorId: actor.sub,
      actorEmail: actor.email,
      action: isActive ? 'coupon.enable' : 'coupon.disable',
      entityType: 'Coupon',
      entityId: id,
    });
    return this.get(id);
  }

  /**
   * Every rejection reason the spec calls out, checked in one place so the
   * validate endpoint and the redeem path can never disagree: unknown code,
   * disabled, not yet valid, expired, exhausted, wrong plan, already redeemed.
   */
  async validate(code: string, organizationId: string, planId: string): Promise<Coupon> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
      include: { plans: true },
    });

    const reject = (message: string, reason: string) => {
      throw new BadRequestException({ code: 'COUPON_INVALID', message, details: { reason } });
    };

    if (!coupon) reject('That coupon code is not recognised.', 'unknown');
    if (!coupon!.isActive) reject('That coupon is no longer active.', 'disabled');

    const now = new Date();
    if (coupon!.validFrom && coupon!.validFrom > now) {
      reject(`That coupon is not valid until ${coupon!.validFrom.toISOString().slice(0, 10)}.`, 'not_yet_valid');
    }
    if (coupon!.validUntil && coupon!.validUntil < now) reject('That coupon has expired.', 'expired');

    if (coupon!.maxRedemptions !== null && coupon!.redemptionCount >= coupon!.maxRedemptions) {
      reject('That coupon has reached its redemption limit.', 'exhausted');
    }

    if (coupon!.plans.length && !coupon!.plans.some((p) => p.planId === planId)) {
      reject('That coupon does not apply to the selected plan.', 'wrong_plan');
    }

    const already = await this.prisma.couponRedemption.findUnique({
      where: { couponId_organizationId: { couponId: coupon!.id, organizationId } },
    });
    if (already) reject('This organization has already used that coupon.', 'already_redeemed');

    return coupon!;
  }

  /** Discount in minor units for a given subtotal. Trial-extension coupons discount nothing. */
  discountFor(coupon: Pick<Coupon, 'type' | 'value'>, subtotalMinor: number) {
    if (coupon.type === 'PERCENTAGE') return Math.min(subtotalMinor, Math.round((subtotalMinor * coupon.value) / 100));
    if (coupon.type === 'FIXED') return Math.min(subtotalMinor, coupon.value);
    return 0;
  }

  /**
   * Redeems inside the caller's transaction. The conditional updateMany is what
   * makes the cap safe: two concurrent redemptions of the last seat cannot both
   * match `redemptionCount < maxRedemptions`.
   */
  async redeem(
    tx: Prisma.TransactionClient,
    coupon: Coupon,
    organizationId: string,
    subscriptionId: string | null,
    discountMinor: number,
  ) {
    const { count } = await tx.coupon.updateMany({
      where: {
        id: coupon.id,
        isActive: true,
        OR: [{ maxRedemptions: null }, { redemptionCount: { lt: coupon.maxRedemptions ?? Number.MAX_SAFE_INTEGER } }],
      },
      data: { redemptionCount: { increment: 1 } },
    });
    if (!count) {
      throw new BadRequestException({
        code: 'COUPON_INVALID',
        message: 'That coupon has reached its redemption limit.',
        details: { reason: 'exhausted' },
      });
    }

    await tx.couponRedemption.create({
      data: { couponId: coupon.id, organizationId, subscriptionId, discountMinor },
    });
  }

  private async assertPlansExist(planIds: string[]) {
    if (!planIds.length) return;
    const found = await this.prisma.plan.count({ where: { id: { in: planIds } } });
    if (found !== planIds.length) {
      throw new BadRequestException({ code: 'PLAN_NOT_FOUND', message: 'One or more selected plans no longer exist.' });
    }
  }
}

function shape<T extends { plans: { plan: { id: string; name: string } }[] }>(coupon: T) {
  const { plans, ...rest } = coupon;
  return { ...rest, plans: plans.map((p) => p.plan) };
}
