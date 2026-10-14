import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { PortalService } from './portal.service';

/**
 * Spec §65 — the parent and student portal.
 *
 * `TenantAuthGuard` already confines PARENT and STUDENT to this prefix; the
 * role decorator here is the second lock, keeping staff out of a surface whose
 * queries assume `portalStudentIds` is set.
 */
@OrgRoles('PARENT', 'STUDENT')
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  /** The child switcher. A parent with children at two branches sees both. */
  @Get('children')
  children(@Tenant() ctx: TenantContext) {
    return this.portal.children(ctx);
  }

  @Get('students/:id')
  overview(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.overview(ctx, id);
  }

  @Get('students/:id/attendance')
  attendance(
    @Tenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.portal.attendance(ctx, id, from, to);
  }

  @Get('students/:id/results')
  results(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.results(ctx, id);
  }

  @Get('students/:id/fees')
  fees(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.fees(ctx, id);
  }

  @Get('students/:id/homework')
  homework(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.homework(ctx, id);
  }

  @Get('students/:id/materials')
  materials(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.materials(ctx, id);
  }

  @Get('students/:id/announcements')
  announcements(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.announcements(ctx, id);
  }
}
