import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { loadEnv } from '../../common/config/env';
import type { PlatformRole } from '@prisma/client';

export interface AccessClaims {
  sub: string;
  email: string;
  role: PlatformRole;
  sid: string;
  typ: 'platform';
}

@Injectable()
export class TokenService {
  private readonly env = loadEnv();

  constructor(private readonly jwt: JwtService) {}

  signAccess(claims: Omit<AccessClaims, 'typ'>) {
    return this.jwt.signAsync(
      { ...claims, typ: 'platform' },
      {
        secret: this.env.JWT_ACCESS_SECRET,
        // jsonwebtoken types this as a `ms` template literal; ours comes from env
        // and is validated at boot, so assert rather than widen the signature.
        expiresIn: this.env.JWT_ACCESS_TTL as unknown as number,
      },
    );
  }

  verifyAccess(token: string) {
    return this.jwt.verifyAsync<AccessClaims>(token, { secret: this.env.JWT_ACCESS_SECRET });
  }

  /**
   * Refresh tokens are opaque random strings, not JWTs — they must be revocable,
   * and a self-describing token cannot be revoked without a lookup anyway. Only
   * the SHA-256 digest is stored, so a database leak yields nothing replayable.
   */
  newOpaqueToken() {
    const token = randomBytes(48).toString('base64url');
    return { token, hash: hashToken(token) };
  }
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
