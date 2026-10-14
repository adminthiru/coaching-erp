import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { paginationSchema, publishAnnouncementSchema, upsertAnnouncementSchema } from '@acadia/validation';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { CommunicationService } from './communication.service';

@Controller('announcements')
export class CommunicationController {
  constructor(private readonly communication: CommunicationService) {}

  @Get()
  list(
    @Tenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('status') status?: any,
  ) {
    return this.communication.list(ctx, { ...query, status });
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.communication.get(ctx, id);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post()
  create(@Tenant() ctx: TenantContext, @Body(zodBody(upsertAnnouncementSchema)) body: any) {
    return this.communication.create(ctx, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Post(':id/status')
  setStatus(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(publishAnnouncementSchema)) body: any,
  ) {
    return this.communication.setStatus(ctx, id, body.status);
  }
}
