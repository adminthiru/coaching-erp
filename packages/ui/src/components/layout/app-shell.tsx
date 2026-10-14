"use client";

import * as React from "react";
import { Sidebar, type NavGroup, type LinkRenderer } from "./sidebar";
import { Drawer } from "../ui/drawer";
import { Button } from "../ui/button";

export interface AppShellProps {
  groups: NavGroup[];
  activeHref: string;
  workspace: { name: string; subtitle?: string; initial: string };
  user: { name: string; role: string };
  children: React.ReactNode;
  /** Replaces the sidebar workspace button — the ERP passes its <BranchSwitcher>. */
  workspaceSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
  /** Next's <Link>, so navigation stays client-side. */
  renderLink?: LinkRenderer;
}

/**
 * Desktop: fixed rail. Mobile: the rail becomes a drawer behind a menu button.
 *
 * Everything is prop-driven — the same shell serves the Super Admin Console and
 * the ERP, which is why neither nav nor identity is baked in here.
 */
export function AppShell({
  groups, activeHref, workspace, user, children, workspaceSlot, footerSlot, renderLink,
}: AppShellProps) {
  const [navOpen, setNavOpen] = React.useState(false);

  // Close the mobile drawer whenever the route changes, otherwise it covers the
  // page the user just navigated to.
  React.useEffect(() => { setNavOpen(false); }, [activeHref]);

  const sidebarProps = { groups, activeHref, workspace, user, workspaceSlot, footerSlot, renderLink };

  return (
    <div className="flex min-h-screen bg-bg">
      <div className="hidden lg:block">
        <Sidebar {...sidebarProps} className="sticky top-0 h-screen" />
      </div>

      <Drawer open={navOpen} onClose={() => setNavOpen(false)} side="left" width={264}>
        <Sidebar {...sidebarProps} className="border-r-0" onNavigate={() => setNavOpen(false)} />
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5 lg:hidden">
          <Button size="sm" variant="outline" iconOnly aria-label="Open navigation" onClick={() => setNavOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
              <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
            </svg>
          </Button>
          <span className="truncate text-label text-fg">{workspace.name}</span>
        </div>
        <main className="flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
