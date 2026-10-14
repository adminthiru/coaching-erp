import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { paginationSchema, upsertCouponSchema } from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AccessClaims } from '../auth/token.service';
import { CouponsService } from './coupons.service';

@Controller('platform/coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(paginationSchema)) query: any, @Query('isActive') isActive?: string) {
    return this.coupons.list({ ...query, isActive: isActive === undefined ? undefined : isActive === 'true' });
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.coupons.get(id);
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Post()
  create(@Body(zodBody(upsertCouponSchema)) body: any, @CurrentUser() user: AccessClaims) {
    return this.coupons.create(body, user);
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(upsertCouponSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.coupons.update(id, body, user);
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Post(':id/enable')
  enable(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AccessClaims) {
    return this.coupons.setActive(id, true, user);
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Post(':id/disable')
  disable(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AccessClaims) {
    return this.coupons.setActive(id, false, user);
  }

  /** Dry run used by the change-plan drawer before committing. */
  @Get('validate/:code')
  async validate(
    @Param('code') code: string,
    @Query('organizationId', ParseUUIDPipe) organizationId: string,
    @Query('planId', ParseUUIDPipe) planId: string,
  ) {
    const coupon = await this.coupons.validate(code, organizationId, planId);
    return { valid: true, coupon: { id: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value, duration: coupon.duration } };
  }
}
