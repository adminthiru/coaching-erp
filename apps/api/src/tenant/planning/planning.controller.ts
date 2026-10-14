import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { upsertLessonPlanSchema } from '@acadia/validation';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { PlanningService } from './planning.service';

/** Spec §44 — lesson, revision, practice and test plans. */
@Controller('lesson-plans')
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query('batchId') batchId?: string,
    @Query('type') type?: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.planning.list(ctx, { batchId, type, from, to });
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Post()
  create(@Tenant() ctx: TenantContext, @Body(zodBody(upsertLessonPlanSchema)) body: any) {
    return this.planning.create(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Patch(':id')
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(upsertLessonPlanSchema.partial())) body: any,
  ) {
    return this.planning.update(ctx, id, body);
  }
}
