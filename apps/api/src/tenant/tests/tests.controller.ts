import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  createTestSchema, paginationSchema, recordOfflineScoresSchema, saveAnswersSchema, setTestQuestionsSchema,
  startAttemptSchema, testStatusSchema,
} from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { TestsService } from './tests.service';
import { AttemptsService } from './attempts.service';

/** Spec §§52–54 — test management, the online engine and results. */
@Controller('tests')
export class TestsController {
  constructor(
    private readonly tests: TestsService,
    private readonly attempts: AttemptsService,
  ) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('status') status?: any,
    @Query('scope') scope?: any,
  ) {
    return this.tests.list(ctx, { ...query, status, scope });
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tests.get(ctx, id);
  }

  /** The paper. Answers come back only once results are published. */
  @Get(':id/questions')
  questions(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('withAnswers') withAnswers?: string,
  ) {
    return this.tests.questions(ctx, id, withAnswers === 'true');
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post()
  create(@Tenant() ctx: TenantContext, @Body(zodBody(createTestSchema)) body: any) {
    return this.tests.create(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Post(':id/questions')
  setQuestions(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(setTestQuestionsSchema)) body: any,
  ) {
    return this.tests.setQuestions(ctx, id, body.questions);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post(':id/status')
  changeStatus(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(testStatusSchema)) body: any,
  ) {
    return this.tests.changeStatus(ctx, id, body.status, body.reason);
  }

  /** Spec §54 — computes batch, branch and organization rank plus percentile. */
  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post(':id/publish-results')
  publish(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tests.publishResults(ctx, id);
  }

  @Get(':id/results')
  results(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tests.results(ctx, id);
  }

  /** Spec §52 mode=OFFLINE — there is no attempt engine for a paper test. */
  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Post(':id/scores')
  recordScores(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(recordOfflineScoresSchema)) body: any,
  ) {
    return this.tests.recordOfflineScores(ctx, id, body.scores);
  }

  /* ── The online engine (spec §53) ─────────────────────────────────────── */

  /**
   * Starting is idempotent — calling it again returns the live attempt with the
   * remaining time, which is exactly what a reconnect needs.
   */
  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Post(':id/attempts')
  start(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(startAttemptSchema)) body: any,
  ) {
    return this.attempts.start(ctx, id, body.studentId);
  }
}

/** Attempt operations are addressed by attempt id, so they get their own route. */
@Controller('attempts')
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  /** Reconnect: the paper, saved answers, and server-computed time remaining. */
  @Get(':id')
  resume(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.attempts.resume(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY', 'STUDENT')
  @Post(':id/answers')
  save(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(saveAnswersSchema)) body: any,
  ) {
    return this.attempts.save(ctx, id, body.answers);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY', 'STUDENT')
  @Post(':id/submit')
  submit(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.attempts.submit(ctx, id);
  }
}
