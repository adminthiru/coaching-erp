"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

type Tone = "primary" | "success" | "warning" | "error";

const BAR: Record<Tone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
};

export interface ProgressProps {
  value: number;
  max?: number;
  tone?: Tone;
  /** Bar thickness. `sm` for inline table cells, `md` for panels. */
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}

/** Bare determinate bar. For plan/quota consumption use <UsageMeter> instead. */
export function Progress({ value, max = 100, tone = "primary", size = "md", className, ...aria }: ProgressProps) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={aria["aria-label"]}
      className={cn("w-full overflow-hidden rounded-full bg-surface-secondary", size === "sm" ? "h-1.5" : "h-2", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", BAR[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Plan entitlement consumption — spec §16.
 *
 * Renders "Branches  4 / 5" with a bar that shifts to warning at 80% and error at
 * 100%. `limit: null` means unlimited (Enterprise) and renders no bar at all,
 * because a bar with no ceiling is meaningless.
 */
export function UsageMeter({
  label,
  used,
  limit,
  unit,
  hint,
  className,
}: {
  label: string;
  used: number;
  limit: number | null;
  unit?: string;
  hint?: string;
  className?: string;
}) {
  const unlimited = limit === null;
  const pct = unlimited || limit === 0 ? 0 : (used / limit) * 100;
  const tone: Tone = pct >= 100 ? "error" : pct >= 80 ? "warning" : "primary";
  const fmt = (n: number) => n.toLocaleString("en-IN");

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body-sm text-fg-secondary">{label}</span>
        <span className="font-mono text-body-sm tabular-nums text-fg">
          {fmt(used)}
          {unlimited ? (
            <span className="text-fg-muted"> / ∞</span>
          ) : (
            <span className={cn(pct >= 100 ? "text-error" : "text-fg-muted")}> / {fmt(limit)}</span>
          )}
          {unit && <span className="text-fg-muted"> {unit}</span>}
        </span>
      </div>
      {!unlimited && <Progress value={used} max={limit} tone={tone} size="sm" aria-label={`${label} usage`} />}
      {hint && <span className="text-caption text-fg-muted">{hint}</span>}
    </div>
  );
}
