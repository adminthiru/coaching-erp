"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { BrandLogo } from "../brand/brand";
import {
  BuildingIcon, CalendarIcon, CardIcon, ChartIcon, CheckSquareIcon, DashboardIcon, FileIcon,
  FlagIcon, LayersIcon, LifebuoyIcon, ReceiptIcon, SettingsIcon, ShieldIcon, TagIcon, UsersIcon,
  WalletIcon,
} from "../icons";

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

/**
 * Lets the host app supply its router's link (Next's `<Link>`) so navigation is
 * client-side. Defaults to a plain anchor, keeping the package framework-agnostic.
 */
export type LinkRenderer = (props: {
  href: string;
  className: string;
  children: React.ReactNode;
  "aria-current"?: "page";
}) => React.ReactElement;

const defaultLink: LinkRenderer = ({ href, className, children, ...rest }) => (
  <a href={href} className={className} {...rest}>{children}</a>
);

export interface SidebarProps {
  groups: NavGroup[];
  activeHref: string;
  workspace: { name: string; subtitle?: string; initial: string };
  user: { name: string; role: string };
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Replaces the workspace button — the ERP passes its <BranchSwitcher> here. */
  workspaceSlot?: React.ReactNode;
  /** Rendered under the user chip — sign out, settings. */
  footerSlot?: React.ReactNode;
  /** Renders the workspace chip as a switcher, with a chevron affordance. */
  onWorkspaceClick?: () => void;
  renderLink?: LinkRenderer;
  onNavigate?: () => void;
  className?: string;
}

/**
 * Active-state matching. `/organizations` must stay lit on `/organizations/42`,
 * but `/` must not light up for every route — so the root href matches exactly.
 */
export function isNavActive(href: string, current: string) {
  if (href === "/") return current === "/";
  return current === href || current.startsWith(`${href}/`);
}

/**
 * The application rail, matching the Campus Engine UI app-shell reference exactly:
 * a `--surface-2` rail at 226px, 16px/12px padding, 7px/10px nav rows on a 10px
 * radius, the active row filled `--primary`, and hover lifting a row onto
 * `--surface`. The workspace and user chips are 9px-radius cards on `--surface`.
 */
export function Sidebar({
  groups, activeHref, workspace, user, collapsed, workspaceSlot, footerSlot,
  onWorkspaceClick, renderLink = defaultLink, onNavigate, className,
}: SidebarProps) {
  const chip = cn(
    "flex items-center gap-[9px] rounded-[9px] border border-border bg-surface text-left",
    collapsed && "justify-center"
  );

  return (
    <aside
      className={cn(
        "flex h-full flex-col gap-4 border-r border-border bg-surface-secondary px-3 py-4",
        collapsed ? "w-[68px]" : "w-[226px]",
        className
      )}
    >
      <div className={cn("flex items-center px-1.5 pt-0.5", collapsed && "justify-center px-0")}>
        <BrandLogo size="sm" markOnly={collapsed} />
      </div>

      {workspaceSlot ?? (
        <WorkspaceChip
          workspace={workspace}
          collapsed={collapsed}
          className={chip}
          onClick={onWorkspaceClick}
        />
      )}

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {groups.map((g, i) => (
          <div key={g.label ?? i} className="flex flex-col gap-0.5">
            {g.label && !collapsed && (
              <span className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                {g.label}
              </span>
            )}
            {g.items.map((item) => {
              const active = isNavActive(item.href, activeHref);
              return (
                <React.Fragment key={item.href}>
                  {renderLink({
                    href: item.href,
                    "aria-current": active ? "page" : undefined,
                    className: cn(
                      "flex items-center justify-between gap-[9px] rounded-md px-2.5 py-[7px] text-[13px] transition-colors",
                      collapsed && "justify-center px-0",
                      // Filled, not tinted: `--primary-soft` on the sidebar's
                      // own tinted background left barely any contrast step, so
                      // the current page did not read as selected at a glance.
                      // The icon inherits `currentColor`, so it flips with it.
                      active
                        ? "bg-primary font-semibold text-primary-fg shadow-sm"
                        : "text-fg-secondary hover:bg-surface hover:text-fg"
                    ),
                    children: (
                      <>
                        <span
                          className={cn("flex min-w-0 items-center gap-[9px]", collapsed && "gap-0")}
                          onClick={onNavigate}
                        >
                          {item.icon && <span className="grid shrink-0 place-items-center">{item.icon}</span>}
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </span>
                        {!collapsed && item.badge !== undefined && (
                          <span
                            className={cn(
                              "shrink-0 font-mono text-[10.5px]",
                              // On a filled row the usual muted/error colours
                              // disappear into the primary background, so the
                              // badge borrows the row's own foreground.
                              active
                                ? cn("text-primary-fg", item.badgeTone === "error" && "font-semibold")
                                : item.badgeTone === "error"
                                  ? "font-semibold text-error"
                                  : "text-fg-muted"
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </>
                    ),
                  })}
                </React.Fragment>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5">
        <div className={cn(chip, "p-2")}>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-info-soft text-[11px] font-semibold text-info">
            {user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[12.5px] font-semibold text-fg">{user.name}</span>
              <span className="truncate text-[10.5px] text-fg-muted">{user.role}</span>
            </span>
          )}
        </div>
        {!collapsed && footerSlot}
      </div>
    </aside>
  );
}

function WorkspaceChip({
  workspace, collapsed, className, onClick,
}: {
  workspace: SidebarProps["workspace"];
  collapsed?: boolean;
  className: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="grid size-[26px] shrink-0 place-items-center rounded-[9px] bg-primary text-[12px] font-bold text-primary-fg">
        {workspace.initial}
      </span>
      {!collapsed && (
        <>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[12.5px] font-semibold text-fg">{workspace.name}</span>
            {workspace.subtitle && (
              <span className="truncate text-[10.5px] text-fg-muted">{workspace.subtitle}</span>
            )}
          </span>
          {onClick && (
            <svg
              width="12" height="12" viewBox="0 0 16 16" fill="none"
              stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round"
              aria-hidden className="shrink-0"
            >
              <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
            </svg>
          )}
        </>
      )}
    </>
  );

  // Only a chip that actually does something becomes a button.
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(className, "px-2 py-1.5")}>
      {inner}
    </button>
  ) : (
    <div className={cn(className, "px-2 py-1.5")}>{inner}</div>
  );
}

export const ERP_NAV: NavGroup[] = [
  { items: [{ label: "Dashboard", href: "/dashboard", icon: <DashboardIcon /> }] },
  { label: "Academic", items: [
    { label: "Batches", href: "/batches", icon: <LayersIcon /> },
    { label: "Students", href: "/students", icon: <UsersIcon /> },
    { label: "Attendance", href: "/attendance", icon: <CheckSquareIcon /> },
    { label: "Exams", href: "/exams", icon: <FileIcon /> },
    { label: "Homework", href: "/homework", icon: <FileIcon /> },
    { label: "Timetable", href: "/timetable", icon: <CalendarIcon /> },
  ]},
  { label: "Finance", items: [
    { label: "Fees", href: "/fees", icon: <WalletIcon /> },
    { label: "Income", href: "/income", icon: <ReceiptIcon /> },
    { label: "Expenses", href: "/expenses", icon: <CardIcon /> },
  ]},
  { label: "Management", items: [
    { label: "Teachers", href: "/teachers", icon: <UsersIcon /> },
    { label: "Staff", href: "/staff", icon: <UsersIcon /> },
    { label: "Courses", href: "/courses", icon: <LayersIcon /> },
    { label: "Subjects", href: "/subjects", icon: <FileIcon /> },
  ]},
  { items: [
    { label: "Reports", href: "/reports", icon: <ChartIcon /> },
    { label: "Settings", href: "/settings", icon: <SettingsIcon /> },
  ]},
];

/**
 * Platform Super Admin Console navigation — spec §§10–24.
 *
 * Lists only routes that exist. The API already serves subscriptions, coupons,
 * invoices, payments, support and feature flags; their screens are added here as
 * each one lands, rather than shipping navigation that dead-ends in a 404.
 */
export const SUPER_ADMIN_NAV: NavGroup[] = [
  { items: [{ label: "Dashboard", href: "/dashboard", icon: <DashboardIcon /> }] },
  { label: "Customers", items: [
    { label: "Organizations", href: "/organizations", icon: <BuildingIcon /> },
  ]},
  { label: "Billing", items: [
    { label: "Plans", href: "/plans", icon: <CardIcon /> },
  ]},
  { label: "Platform", items: [
    { label: "Audit Logs", href: "/audit-logs", icon: <ShieldIcon /> },
  ]},
];

/** Screens that exist once the remaining Phase 0 modules land. */
export const SUPER_ADMIN_NAV_FULL: NavGroup[] = [
  { items: [{ label: "Dashboard", href: "/dashboard", icon: <DashboardIcon /> }] },
  { label: "Customers", items: [
    { label: "Organizations", href: "/organizations", icon: <BuildingIcon /> },
    { label: "Subscriptions", href: "/subscriptions", icon: <LayersIcon /> },
  ]},
  { label: "Billing", items: [
    { label: "Plans", href: "/plans", icon: <CardIcon /> },
    { label: "Coupons", href: "/coupons", icon: <TagIcon /> },
    { label: "Invoices", href: "/invoices", icon: <ReceiptIcon /> },
    { label: "Payments", href: "/payments", icon: <WalletIcon /> },
  ]},
  { label: "Platform", items: [
    { label: "Analytics", href: "/analytics", icon: <ChartIcon /> },
    { label: "Feature Flags", href: "/feature-flags", icon: <FlagIcon /> },
    { label: "Support", href: "/support", icon: <LifebuoyIcon /> },
    { label: "Audit Logs", href: "/audit-logs", icon: <ShieldIcon /> },
  ]},
  { items: [
    { label: "Admin Users", href: "/admin-users", icon: <UsersIcon /> },
    { label: "Settings", href: "/settings", icon: <SettingsIcon /> },
  ]},
];
