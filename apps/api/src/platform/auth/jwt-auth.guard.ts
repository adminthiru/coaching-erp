import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from './auth.decorators';
import { isTenantRoute } from '../../common/guards/route-scope';
import { TokenService } from './token.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Applied globally — a route is protected unless it opts out with @Public().
 * Defaulting to "closed" means a new controller cannot be forgotten into being
 * publicly reachable.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: unknown }>();
    // Tenant routes are TenantAuthGuard's to enforce.
    if (isTenantRoute(req)) return true;
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
    }

    let claims;
    try {
      claims = await this.tokens.verifyAccess(header.slice(7));
    } catch {
      throw new UnauthorizedException({ code: 'TOKEN_INVALID', message: 'Your session has expired.' });
    }

    // A valid signature is not enough: the session must still be live, so signing
    // out or revoking a device takes effect immediately rather than at token expiry.
    const session = await this.prisma.platformSession.findFirst({
      where: { id: claims.sid, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, user: { select: { id: true, isActive: true, deletedAt: true, role: true } } },
    });
    if (!session || !session.user.isActive || session.user.deletedAt) {
      throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Your session has ended.' });
    }

    // Role is read from the database, not the token, so a demotion applies at once.
    req.user = { ...claims, role: session.user.role };
    return true;
  }
}
