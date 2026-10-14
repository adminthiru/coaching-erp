import { Body, Controller, Get, Patch } from '@nestjs/common';
import { orgProfileSchema } from '@acadia/validation';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { OrgRoles, Tenant } from '../scope/tenant.decorators';
import type { TenantContext } from '../scope/tenant-context';
import { TenantOrganizationService } from './tenant-organization.service';

@Controller('organization')
export class TenantOrganizationController {
  constructor(private readonly org: TenantOrganizationService) {}

  @Get()
  profile(@Tenant() ctx: TenantContext) {
    return this.org.profile(ctx);
  }

  @OrgRoles('ORG_ADMIN')
  @Patch()
  update(@Tenant() ctx: TenantContext, @Body(zodBody(orgProfileSchema)) body: any) {
    return this.org.update(ctx, body);
  }
}
