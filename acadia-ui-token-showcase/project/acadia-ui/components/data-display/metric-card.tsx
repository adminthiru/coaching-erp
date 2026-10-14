import * as React from "react";
import { cn } from "@/lib/cn";

export interface MetricCardProps {
  title: string;
  value: string;
  /** Signed percentage or count, e.g. 8.4 or -12. Omit for a flat metric. */
  delta?: number;
  deltaLabel?: string;
  /** Lower is better — inverts the delta colour (pending fees, expenses). */
  invertDelta?: boolean;
  description?: string;
  icon?: React.ReactNode;
  iconTone?: "primary" | "success" | "warning" | "error" | "info";
  /** 6–12 points. Rendered as a bare sparkline, no axes. */
  trend?: number[];
}

const TONE = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  error: "bg-error-soft text-error",
  info: "bg-info-soft text-info",
};

export function MetricCard({
  title, value, delta, deltaLabel, invertDelta, description, icon, iconTone = "primary", trend,
}: MetricCardProps) {
  const positive = delta === undefined ? null : invertDelta ? delta < 0 : delta > 0;
  const flat = delta === 0 || delta === undefined;
  const tone = flat ? "neutral" : positive ? "success" : "error";

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="text-label text-fg-secondary">{title}</span>
        {icon && <span className={cn("grid size-[26px] place-items-center rounded-sm", TONE[iconTone])}>{icon}</span>}
      </div>

      <div className="font-mono text-[27px] font-semibold tracking-[-0.02em] tabular-nums">{value}</div>

      <div className="flex items-center justify-between gap-2.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold",
            tone === "success" && "bg-success-soft text-success",
            tone === "error" && "bg-error-soft text-error",
            tone === "neutral" && "border border-border bg-surface-secondary text-fg-secondary"
          )}
        >
          {flat ? "—" : positive ? "↑" : "↓"} {deltaLabel ?? `${Math.abs(delta ?? 0)}%`}
        </span>
        {trend && trend.length > 1 && <Sparkline points={trend} tone={tone} />}
      </div>

      {description && <span className="text-caption text-fg-muted">{description}</span>}
    </div>
  );
}

function Sparkline({ points, tone }: { points: number[]; tone: "success" | "error" | "neutral" }) {
  const w = 78, h = 22, pad = 2;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = pad + (i * (w - pad * 2)) / (points.length - 1);
      const y = h - pad - ((p - min) / span) * (h - pad * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = tone === "success" ? "var(--success)" : tone === "error" ? "var(--error)" : "var(--info)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden>
      <path d={d} stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
