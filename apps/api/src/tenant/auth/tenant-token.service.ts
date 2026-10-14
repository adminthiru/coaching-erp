import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { loadEnv } from '../../common/config/env';
import type { OrgRole } from '@prisma/client';

export interface TenantClaims {
  sub: string;
  email: string;
  org: string;
  role: OrgRole;
  sid: string;
  /** Distinguishes a tenant token from a platform one — they must never cross. */
  typ: 'tenant';
}

@Injectable()
export class TenantTokenService {
  private readonly env = loadEnv();

  constructor(private readonly jwt: JwtService) {}

  signAccess(claims: Omit<TenantClaims, 'typ'>) {
    return this.jwt.signAsync(
      { ...claims, typ: 'tenant' },
      {
        secret: this.env.JWT_ACCESS_SECRET,
        expiresIn: this.env.JWT_ACCESS_TTL as unknown as number,
      },
    );
  }

  async verifyAccess(token: string) {
    const claims = await this.jwt.verifyAsync<TenantClaims>(token, {
      secret: this.env.JWT_ACCESS_SECRET,
    });
    // A platform token is signed with the same secret; the type claim is what
    // stops one being replayed against the other's guard.
    if (claims.typ !== 'tenant') throw new Error('Wrong token type');
    return claims;
  }

  newOpaqueToken() {
    const token = randomBytes(48).toString('base64url');
    return { token, hash: hashToken(token) };
  }
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
