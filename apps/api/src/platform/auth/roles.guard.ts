import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlatformRole } from '@prisma/client';
import { ROLES_KEY } from './auth.decorators';
import { isTenantRoute } from '../../common/guards/route-scope';
import type { FastifyRequest } from 'fastify';

/**
 * Spec §9 — permissions must be granular. Roles are not ranked: FINANCE_ADMIN is
 * not "less than" SUPPORT_ADMIN, it is different. Each route lists exactly the
 * roles that may reach it, with PLATFORM_OWNER always permitted.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (isTenantRoute(ctx.switchToHttp().getRequest<FastifyRequest>())) return true;

    const required = this.reflector.getAllAndOverride<PlatformRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const user = ctx.switchToHttp().getRequest().user as { role?: PlatformRole } | undefined;
    if (!user?.role) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not have access.' });
    if (user.role === 'PLATFORM_OWNER' || required.includes(user.role)) return true;

    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Your role does not permit this action.',
    });
  }
}
