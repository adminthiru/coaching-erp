import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { OrgRole } from '@prisma/client';
import type { TenantContext } from './tenant-context';

export const TENANT_ROLES_KEY = 'tenantRoles';
/** Restricts a route to the listed tenant roles. ORG_OWNER always passes. */
export const OrgRoles = (...roles: OrgRole[]) => SetMetadata(TENANT_ROLES_KEY, roles);

export const IS_TENANT_PUBLIC_KEY = 'isTenantPublic';
export const TenantPublic = () => SetMetadata(IS_TENANT_PUBLIC_KEY, true);

/** The resolved tenant context. Server-derived; never client-supplied. */
export const Tenant = createParamDecorator((_d: unknown, ctx: ExecutionContext): TenantContext => {
  return ctx.switchToHttp().getRequest().tenant;
});
