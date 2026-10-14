import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  applyCouponSchema, cancelSubscriptionSchema, changePlanSchema, paginationSchema,
} from '@acadia/validation';
import { z } from 'zod';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AccessClaims } from '../auth/token.service';
import { SubscriptionsService } from './subscriptions.service';

const transitionSchema = z.object({
  status: z.enum(['TRIAL', 'ACTIVE', 'RENEWAL', 'PAYMENT_DUE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED']),
  reason: z.string().trim().max(400).optional(),
});

@Controller('platform')
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Get('subscriptions')
  list(
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('status') status?: any,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.subs.list({ ...query, status, organizationId });
  }

  @Get('subscriptions/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.subs.get(id);
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Post('organizations/:id/change-plan')
  changePlan(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body(zodBody(changePlanSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.subs.changePlan(organizationId, body, user);
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Post('organizations/:id/apply-coupon')
  applyCoupon(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body(zodBody(applyCouponSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.subs.applyCoupon(organizationId, body.code, user);
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Post('subscriptions/:id/status')
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(transitionSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.subs.transition(id, body.status, body.reason, user);
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Post('subscriptions/:id/renew')
  renew(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AccessClaims) {
    return this.subs.renew(id, user);
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Post('subscriptions/:id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(cancelSubscriptionSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.subs.cancel(id, body.atPeriodEnd, body.reason, user);
  }
}
