'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell, Button, SUPER_ADMIN_NAV } from '@acadia/ui';
import { PLATFORM_ROLE_LABEL, type PlatformRole } from '@acadia/types';
import { useAuth } from '@/lib/auth';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, status, signOut } = useAuth();

  // AuthProvider redirects anonymous visitors; this only avoids a flash of the
  // console shell while that resolves.
  if (status !== 'authenticated' || !user) {
    return <div className="grid min-h-screen place-items-center text-body-sm text-fg-muted">Loading…</div>;
  }

  return (
    <AppShell
      groups={SUPER_ADMIN_NAV}
      activeHref={pathname}
      workspace={{ name: 'Platform Console', subtitle: 'Super Admin', initial: 'P' }}
      user={{ name: user.name, role: PLATFORM_ROLE_LABEL[user.role as PlatformRole] ?? user.role }}
      renderLink={({ href, children: linkChildren, ...rest }) => (
        <Link href={href} {...rest}>{linkChildren}</Link>
      )}
      footerSlot={
        <Button variant="ghost" size="sm" fullWidth onClick={() => void signOut()}>
          Sign out
        </Button>
      }
    >
      {/* Detail pages read their record id from the query string, and a static
          export needs a Suspense boundary above every useSearchParams call. */}
      <React.Suspense fallback={null}>{children}</React.Suspense>
    </AppShell>
  );
}
