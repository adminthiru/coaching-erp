import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { inviteGuardianSchema } from '@acadia/validation';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { GuardiansService } from './guardians.service';

/** Spec §65 — staff-side management of portal access for a student. */
@Controller('students/:studentId/guardians')
export class GuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

  @Get()
  list(@Tenant() ctx: TenantContext, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.guardians.list(ctx, studentId);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN', 'COUNSELLOR')
  @Post()
  invite(
    @Tenant() ctx: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body(zodBody(inviteGuardianSchema)) body: any,
  ) {
    return this.guardians.invite(ctx, studentId, body);
  }

  @OrgRoles('ORG_ADMIN', 'BRANCH_ADMIN')
  @Delete(':id')
  unlink(
    @Tenant() ctx: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.guardians.unlink(ctx, studentId, id);
  }
}
