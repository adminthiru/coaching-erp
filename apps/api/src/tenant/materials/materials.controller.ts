import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { createStudyMaterialSchema, paginationSchema } from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { MaterialsService } from './materials.service';

/** Spec §60 — study materials. */
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('subjectId') subjectId?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.materials.list(ctx, { ...query, subjectId, includeArchived: includeArchived === 'true' });
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.materials.get(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Post()
  create(@Tenant() ctx: TenantContext, @Body(zodBody(createStudyMaterialSchema)) body: any) {
    return this.materials.create(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY')
  @Post(':id/archive')
  archive(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.materials.archive(ctx, id);
  }
}
