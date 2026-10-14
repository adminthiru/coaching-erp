import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  initSyllabusSchema, reorderSchema, updateSyllabusProgressSchema, upsertChapterSchema,
  upsertTopicSchema,
} from '@acadia/validation';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { SyllabusService } from './syllabus.service';

@Controller()
export class SyllabusController {
  constructor(private readonly syllabus: SyllabusService) {}

  /** The Course → Subject → Chapter → Topic tree (spec §42). */
  @Get('syllabus/tree')
  tree(@Tenant() ctx: TenantContext, @Query('subjectId') subjectId?: string) {
    return this.syllabus.tree(ctx, subjectId);
  }

  @OrgRoles('ORG_ADMIN')
  @Post('chapters')
  createChapter(@Tenant() ctx: TenantContext, @Body(zodBody(upsertChapterSchema)) body: any) {
    return this.syllabus.createChapter(ctx, body);
  }

  @OrgRoles('ORG_ADMIN')
  @Post('topics')
  createTopic(@Tenant() ctx: TenantContext, @Body(zodBody(upsertTopicSchema)) body: any) {
    return this.syllabus.createTopic(ctx, body);
  }

  @OrgRoles('ORG_ADMIN')
  @Post('chapters/:id/reorder-topics')
  reorder(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(reorderSchema)) body: any,
  ) {
    return this.syllabus.reorderTopics(ctx, id, body.ids);
  }

  /* Per-batch progress (spec §43) */

  @Get('batches/:id/syllabus')
  forBatch(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.syllabus.forBatch(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post('batches/:id/syllabus/initialise')
  initialise(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(initSyllabusSchema)) body: any,
  ) {
    return this.syllabus.initialise(ctx, id, body.subjectIds);
  }

  /** Faculty mark their own topics complete, so they are permitted here. */
  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Patch('syllabus/progress/:id')
  updateProgress(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateSyllabusProgressSchema)) body: any,
  ) {
    return this.syllabus.updateProgress(ctx, id, body);
  }
}
