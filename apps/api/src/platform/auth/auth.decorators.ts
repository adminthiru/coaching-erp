import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PlatformRole } from '@prisma/client';
import type { AccessClaims } from './token.service';

export const IS_PUBLIC_KEY = 'isPublic';
/** Opts a route out of JwtAuthGuard. Use sparingly — login and health only. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restricts a route to the listed platform roles. Enforced by RolesGuard. */
export const Roles = (...roles: PlatformRole[]) => SetMetadata(ROLES_KEY, roles);

/** The authenticated platform user, resolved by JwtAuthGuard. Never client-supplied. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AccessClaims => {
  return ctx.switchToHttp().getRequest().user;
});
