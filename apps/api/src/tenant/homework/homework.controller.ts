import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  createHomeworkSchema, gradeSubmissionSchema, homeworkStatusSchema, markSubmissionSchema, paginationSchema,
} from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { HomeworkService } from './homework.service';

/** Spec §58 — homework assignment, targeting and marking. */
@Controller('homework')
export class HomeworkController {
  constructor(private readonly homework: HomeworkService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('status') status?: any,
  ) {
    return this.homework.list(ctx, { ...query, status });
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.homework.get(ctx, id);
  }

  @Get(':id/roster')
  roster(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.homework.roster(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Post()
  create(@Tenant() ctx: TenantContext, @Body(zodBody(createHomeworkSchema)) body: any) {
    return this.homework.create(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Post(':id/status')
  changeStatus(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(homeworkStatusSchema)) body: any,
  ) {
    return this.homework.changeStatus(ctx, id, body.status);
  }
}

/** Submissions are addressed by their own id, so they get their own route — same split as tests/attempts. */
@Controller('homework-submissions')
export class HomeworkSubmissionsController {
  constructor(private readonly homework: HomeworkService) {}

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Post(':id/mark')
  mark(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(markSubmissionSchema)) body: any,
  ) {
    return this.homework.markSubmission(ctx, id, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Post(':id/grade')
  grade(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(gradeSubmissionSchema)) body: any,
  ) {
    return this.homework.gradeSubmission(ctx, id, body);
  }
}
