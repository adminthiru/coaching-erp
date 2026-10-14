import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { upsertPlanSchema } from '@acadia/validation';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AccessClaims } from '../auth/token.service';
import { PlansService } from './plans.service';

@Controller('platform/plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list(@Query('includeArchived') includeArchived?: string) {
    return this.plans.list(includeArchived === 'true');
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.plans.get(id);
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Post()
  create(@Body(zodBody(upsertPlanSchema)) body: any, @CurrentUser() user: AccessClaims) {
    return this.plans.create(body, user);
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(upsertPlanSchema)) body: any,
    @CurrentUser() user: AccessClaims,
  ) {
    return this.plans.update(id, body, user);
  }

  @Roles('PLATFORM_ADMIN', 'FINANCE_ADMIN')
  @Post(':id/archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AccessClaims) {
    return this.plans.archive(id, user);
  }
}
