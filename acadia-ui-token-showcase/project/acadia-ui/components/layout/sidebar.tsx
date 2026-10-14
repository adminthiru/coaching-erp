"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  /** Count or alert shown on the right. */
  badge?: string | number;
  badgeTone?: "muted" | "error";
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export interface SidebarProps {
  groups: NavGroup[];
  activeHref: string;
  workspace: { name: string; subtitle?: string; initial: string };
  user: { name: string; role: string };
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Mobile: the sidebar is rendered inside a Drawer instead. */
  className?: string;
}

export const ERP_NAV: NavGroup[] = [
  { items: [{ label: "Dashboard", href: "/dashboard" }] },
  { label: "Academic", items: [
    { label: "Batches", href: "/batches" },
    { label: "Students", href: "/students" },
    { label: "Attendance", href: "/attendance" },
    { label: "Exams", href: "/exams" },
    { label: "Homework", href: "/homework" },
    { label: "Timetable", href: "/timetable" },
  ]},
  { label: "Finance", items: [
    { label: "Fees", href: "/fees" },
    { label: "Income", href: "/income" },
    { label: "Expenses", href: "/expenses" },
  ]},
  { label: "Management", items: [
    { label: "Teachers", href: "/teachers" },
    { label: "Staff", href: "/staff" },
    { label: "Courses", href: "/courses" },
    { label: "Subjects", href: "/subjects" },
  ]},
  { items: [
    { label: "Reports", href: "/reports" },
    { label: "Settings", href: "/settings" },
  ]},
];

export function Sidebar({ groups, activeHref, workspace, user, collapsed, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col gap-4 border-r border-border bg-surface-secondary p-3",
        collapsed ? "w-[68px]" : "w-[232px]",
        className
      )}
    >
      <button className="flex items-center gap-2.5 rounded-md border border-border bg-surface p-1.5 text-left">
        <span className="grid size-[26px] shrink-0 place-items-center rounded-sm bg-primary text-[12px] font-bold text-primary-fg">
          {workspace.initial}
        </span>
        {!collapsed && (
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-label text-fg">{workspace.name}</span>
            {workspace.subtitle && <span className="text-[10.5px] text-fg-muted">{workspace.subtitle}</span>}
          </span>
        )}
      </button>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {groups.map((g, i) => (
          <div key={g.label ?? i} className="flex flex-col gap-0.5">
            {g.label && !collapsed && (
              <span className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{g.label}</span>
            )}
            {g.items.map((item) => {
              const active = item.href === activeHref;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center justify-between gap-2.5 rounded-md px-2.5 py-2 text-body-sm",
                    active ? "bg-primary-soft font-semibold text-primary" : "text-fg-secondary hover:bg-surface hover:text-fg"
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    {item.icon}
                    {!collapsed && item.label}
                  </span>
                  {!collapsed && item.badge !== undefined && (
                    <span className={cn("font-mono text-[10.5px]", item.badgeTone === "error" ? "font-semibold text-error" : "text-fg-muted")}>
                      {item.badge}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2.5 rounded-md border border-border bg-surface p-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-info-soft text-[11px] font-semibold text-info">
          {user.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
        </span>
        {!collapsed && (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-label text-fg">{user.name}</span>
            <span className="text-[10.5px] text-fg-muted">{user.role}</span>
          </span>
        )}
      </div>
    </aside>
  );
}
