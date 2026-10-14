"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

/**
 * Charts are hand-rolled SVG on purpose — the design system ships no charting
 * dependency, and every colour resolves to a semantic token so light/dark and
 * re-branding work with no chart-specific handling.
 *
 * Categorical series colours, in assignment order. Chosen to stay distinguishable
 * in both themes and under the common forms of colour-vision deficiency.
 */
export const SERIES = [
  "var(--primary)",
  "var(--success)",
  "var(--warning)",
  "var(--info)",
  "var(--error)",
  "var(--text-muted)",
] as const;

export interface Point {
  label: string;
  value: number;
}

function niceCeiling(max: number) {
  if (max <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / mag) * mag;
}

function ChartFrame({
  title, subtitle, action, children, className, legend,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  legend?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3.5 rounded-lg border border-border bg-card px-5 py-4", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            {title && <span className="text-h4 text-fg">{title}</span>}
            {subtitle && <span className="text-caption text-fg-muted">{subtitle}</span>}
          </div>
          {action}
        </div>
      )}
      {children}
      {legend}
    </div>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 text-caption text-fg-secondary">
          <span className="size-2 shrink-0 rounded-full" style={{ background: i.color }} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Trend over time — MRR, revenue, organization growth. */
export function LineChart({
  data, title, subtitle, action, height = 200, formatValue = (n) => String(n), className,
}: {
  data: Point[];
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  height?: number;
  formatValue?: (n: number) => string;
  className?: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const w = 600, padL = 44, padR = 12, padT = 10, padB = 26;
  const top = niceCeiling(Math.max(...data.map((d) => d.value), 0));
  const innerW = w - padL - padR, innerH = height - padT - padB;

  const x = (i: number) => padL + (data.length === 1 ? innerW / 2 : (i * innerW) / (data.length - 1));
  const y = (v: number) => padT + innerH - (v / top) * innerH;

  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");
  const area = data.length
    ? `${line} L${x(data.length - 1).toFixed(1)} ${padT + innerH} L${x(0).toFixed(1)} ${padT + innerH} Z`
    : "";
  const ticks = [0, 0.5, 1].map((t) => top * t);
  const step = Math.ceil(data.length / 7);

  return (
    <ChartFrame title={title} subtitle={subtitle} action={action} className={className}>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full min-w-[420px]" role="img" aria-label={title ?? "Line chart"}>
          <defs>
            <linearGradient id="acadia-line-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
              <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" className="fill-[var(--text-muted)] text-[10px]">
                {formatValue(t)}
              </text>
            </g>
          ))}

          {area && <path d={area} fill="url(#acadia-line-fill)" />}
          <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {data.map((d, i) => (
            <g key={d.label}>
              {i % step === 0 && (
                <text x={x(i)} y={height - 8} textAnchor="middle" className="fill-[var(--text-muted)] text-[10px]">
                  {d.label}
                </text>
              )}
              <circle cx={x(i)} cy={y(d.value)} r={hover === i ? 4 : 0} fill="var(--primary)" stroke="var(--surface)" strokeWidth="2" />
              <rect
                x={x(i) - innerW / (data.length * 2 || 1)}
                y={padT}
                width={innerW / (data.length || 1)}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          ))}
        </svg>
      </div>

      <span className="h-4 text-caption text-fg-secondary">
        {hover !== null && data[hover] && (
          <>
            <span className="text-fg-muted">{data[hover].label}</span>{" "}
            <span className="font-mono font-semibold tabular-nums text-fg">{formatValue(data[hover].value)}</span>
          </>
        )}
      </span>
    </ChartFrame>
  );
}

/** Discrete comparison — branch vs branch, plan distribution. */
export function BarChart({
  data, title, subtitle, action, height = 200, formatValue = (n) => String(n), horizontal, className,
}: {
  data: Point[];
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  height?: number;
  formatValue?: (n: number) => string;
  horizontal?: boolean;
  className?: string;
}) {
  const top = niceCeiling(Math.max(...data.map((d) => d.value), 0));

  if (horizontal) {
    return (
      <ChartFrame title={title} subtitle={subtitle} action={action} className={className}>
        <div className="flex flex-col gap-2.5">
          {data.map((d, i) => (
            <div key={d.label} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-body-sm text-fg-secondary" title={d.label}>{d.label}</span>
              <div className="h-5 flex-1 overflow-hidden rounded-sm bg-surface-secondary">
                <div
                  className="h-full rounded-sm transition-[width] duration-500"
                  style={{ width: `${top ? (d.value / top) * 100 : 0}%`, background: SERIES[i % SERIES.length] }}
                />
              </div>
              <span className="w-20 shrink-0 text-right font-mono text-body-sm tabular-nums text-fg">{formatValue(d.value)}</span>
            </div>
          ))}
        </div>
      </ChartFrame>
    );
  }

  const w = 600, padL = 44, padR = 12, padT = 10, padB = 26;
  const innerW = w - padL - padR, innerH = height - padT - padB;
  const slot = innerW / (data.length || 1);
  const barW = Math.min(38, slot * 0.6);

  return (
    <ChartFrame title={title} subtitle={subtitle} action={action} className={className}>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full min-w-[420px]" role="img" aria-label={title ?? "Bar chart"}>
          {[0, 0.5, 1].map((t) => {
            const yy = padT + innerH - t * innerH;
            return (
              <g key={t}>
                <line x1={padL} x2={w - padR} y1={yy} y2={yy} stroke="var(--border)" strokeWidth="1" />
                <text x={padL - 8} y={yy + 3.5} textAnchor="end" className="fill-[var(--text-muted)] text-[10px]">
                  {formatValue(top * t)}
                </text>
              </g>
            );
          })}

          {data.map((d, i) => {
            const h = top ? (d.value / top) * innerH : 0;
            const cx = padL + slot * i + slot / 2;
            return (
              <g key={d.label}>
                <rect x={cx - barW / 2} y={padT + innerH - h} width={barW} height={h} rx="4" fill="var(--primary)" />
                <text x={cx} y={height - 8} textAnchor="middle" className="fill-[var(--text-muted)] text-[10px]">
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </ChartFrame>
  );
}

/** Composition — plan mix, status breakdown. */
export function DonutChart({
  data, title, subtitle, centerLabel, centerValue, formatValue = (n) => String(n), className,
}: {
  data: Point[];
  title?: string;
  subtitle?: string;
  centerLabel?: string;
  centerValue?: string;
  formatValue?: (n: number) => string;
  className?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 168, stroke = 26, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      className={className}
      legend={<ChartLegend items={data.map((d, i) => ({ label: `${d.label} · ${formatValue(d.value)}`, color: SERIES[i % SERIES.length] }))} />}
    >
      <div className="flex justify-center">
        <div className="relative">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title ?? "Donut chart"}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
            {total > 0 &&
              data.map((d, i) => {
                const frac = d.value / total;
                const dash = `${frac * c} ${c - frac * c}`;
                const el = (
                  <circle
                    key={d.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={SERIES[i % SERIES.length]}
                    strokeWidth={stroke}
                    strokeDasharray={dash}
                    strokeDashoffset={-offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  />
                );
                offset += frac * c;
                return el;
              })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            <span className="font-mono text-h2 tabular-nums text-fg">{centerValue ?? formatValue(total)}</span>
            {centerLabel && <span className="text-caption text-fg-muted">{centerLabel}</span>}
          </div>
        </div>
      </div>
    </ChartFrame>
  );
}
