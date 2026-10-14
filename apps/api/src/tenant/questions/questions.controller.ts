import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { paginationSchema, upsertQuestionSchema } from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { QuestionsService } from './questions.service';

/** Spec §51 — the question bank. */
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('subjectId') subjectId?: string,
    @Query('chapterId') chapterId?: string,
    @Query('difficulty') difficulty?: any,
    @Query('type') type?: any,
    @Query('scope') scope?: 'org' | 'branch',
  ) {
    return this.questions.list(ctx, { ...query, subjectId, chapterId, difficulty, type, scope });
  }

  /** Bank composition — what a paper-setter needs before building. */
  @Get('stats')
  stats(@Tenant() ctx: TenantContext) {
    return this.questions.stats(ctx);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.questions.get(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Post()
  create(@Tenant() ctx: TenantContext, @Body(zodBody(upsertQuestionSchema)) body: any) {
    return this.questions.create(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Patch(':id')
  update(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(upsertQuestionSchema.innerType().partial())) body: any,
  ) {
    return this.questions.update(ctx, id, body);
  }

  /** The supported way to change a locked question: copy it, edit the copy. */
  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Post(':id/duplicate')
  duplicate(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.questions.duplicate(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post(':id/retire')
  retire(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.questions.retire(ctx, id);
  }
}
