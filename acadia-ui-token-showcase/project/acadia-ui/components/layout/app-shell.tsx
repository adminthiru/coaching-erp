"use client";

import * as React from "react";
import { Sidebar, ERP_NAV } from "@/components/layout/sidebar";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

/** Desktop: fixed rail. Mobile: the rail becomes a drawer behind a menu button. */
export function AppShell({ activeHref, children }: { activeHref: string; children: React.ReactNode }) {
  const [navOpen, setNavOpen] = React.useState(false);
  const workspace = { name: "Vidya Classes", subtitle: "Andheri branch", initial: "V" };
  const user = { name: "Anil Kulkarni", role: "Administrator" };

  return (
    <div className="flex min-h-screen bg-bg">
      <div className="hidden lg:block">
        <Sidebar groups={ERP_NAV} activeHref={activeHref} workspace={workspace} user={user} className="sticky top-0 h-screen" />
      </div>

      <Drawer open={navOpen} onClose={() => setNavOpen(false)} side="left" width={264}>
        <Sidebar groups={ERP_NAV} activeHref={activeHref} workspace={workspace} user={user} className="border-r-0" />
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5 lg:hidden">
          <Button size="sm" variant="outline" iconOnly aria-label="Open navigation" onClick={() => setNavOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
            </svg>
          </Button>
          <span className="text-label text-fg">{workspace.name}</span>
        </div>
        <main className="flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
