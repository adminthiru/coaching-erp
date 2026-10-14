import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './common/prisma/prisma.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { loadEnv } from './common/config/env';

import { AuditModule } from './platform/audit/audit.module';
import { EntitlementsModule } from './platform/entitlements/entitlements.module';
import { AuthModule } from './platform/auth/auth.module';
import { JwtAuthGuard } from './platform/auth/jwt-auth.guard';
import { RolesGuard } from './platform/auth/roles.guard';
import { PlansModule } from './platform/plans/plans.module';
import { OrganizationsModule } from './platform/organizations/organizations.module';
import { CouponsModule } from './platform/coupons/coupons.module';
import { SubscriptionsModule } from './platform/subscriptions/subscriptions.module';
import { BillingModule } from './platform/billing/billing.module';
import { DashboardModule } from './platform/dashboard/dashboard.module';
import { SupportModule } from './platform/support/support.module';
import { FeatureFlagsModule } from './platform/feature-flags/feature-flags.module';
import { PlatformUsersModule } from './platform/users/platform-users.module';
import { TenantModule, TenantRouting } from './tenant/tenant.module';
import { TenantAuthGuard } from './tenant/scope/tenant-auth.guard';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Spec §73 — rate limiting. Auth routes tighten this further with @Throttle.
    // The ceiling is deployable: a centre running behind one office NAT needs a
    // higher limit than the default without a code change.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: loadEnv().RATE_LIMIT_PER_MINUTE }]),

    PrismaModule,
    AuditModule,
    EntitlementsModule,

    AuthModule,
    PlansModule,
    OrganizationsModule,
    CouponsModule,
    SubscriptionsModule,
    BillingModule,
    DashboardModule,
    SupportModule,
    FeatureFlagsModule,
    PlatformUsersModule,

    // Phase 1 — tenant ERP, mounted under /api/tenant
    TenantModule,
    TenantRouting,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: throttle, then authenticate, then authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantAuthGuard },
  ],
})
export class AppModule {}
