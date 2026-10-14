'use client';

import * as React from 'react';
import { Button } from '@acadia/ui';
import { useSession } from '@/lib/session';

/**
 * Spec §65 — the portal is deliberately not the ERP shell. A parent gets no
 * sidebar, no branch switcher and no module navigation, because none of it is
 * theirs; the API refuses those routes anyway (`PORTAL_ONLY`), and showing them
 * would only promise something that cannot work.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, organization, status, isPortalUser, signOut } = useSession();

  if (status !== 'authenticated' || !user || !isPortalUser) {
    return <div className="grid min-h-screen place-items-center text-body-sm text-fg-muted">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-surface-secondary">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-[13px] font-bold text-primary-fg">
              {(organization?.name ?? 'A').charAt(0).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-body-sm font-semibold text-fg">{organization?.name}</span>
              <span className="truncate text-caption text-fg-muted">
                {user.name} · {user.role === 'PARENT' ? 'Parent' : 'Student'}
              </span>
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6">{children}</main>
    </div>
  );
}
