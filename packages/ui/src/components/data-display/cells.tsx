import * as React from "react";
import { cn } from "../../lib/cn";
import { Avatar } from "../ui/avatar";
import { currency, formatDate } from "../../lib/format";

/** Name + id cell. The standard person cell for students, teachers and staff. */
export function PersonCell({ name, meta }: { name: string; meta?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={name} size="sm" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-body-sm font-medium text-fg">{name}</span>
        {meta && <span className="font-mono text-caption text-fg-muted">{meta}</span>}
      </span>
    </div>
  );
}

/** Always right-aligned, always tabular. Zero renders as an em dash. */
export function CurrencyCell({ value, tone }: { value: number; tone?: "auto" | "plain" }) {
  const colour = tone === "plain" ? "" : value > 0 ? "text-success" : value < 0 ? "text-error" : "text-fg";
  return <span className={cn("font-mono text-body-sm tabular-nums", colour)}>{currency(value, { sign: tone !== "plain" })}</span>;
}

export function DateCell({ value }: { value: Date | string }) {
  return <span className="font-mono text-[12.5px] text-fg-secondary">{formatDate(value)}</span>;
}

/** Attendance bar + figure. Thresholds are product-wide: 85 good, 75 warn, below is at risk. */
export function AttendanceCell({ percent }: { percent: number }) {
  const colour = percent >= 85 ? "bg-success" : percent >= 75 ? "bg-warning" : "bg-error";
  return (
    <div className="inline-flex items-center gap-2">
      <span className="h-[5px] w-14 overflow-hidden rounded-full bg-surface-secondary">
        <span className={cn("block h-full rounded-full", colour)} style={{ width: `${percent}%` }} />
      </span>
      <span className="w-9 text-right font-mono text-[12.5px] text-fg-secondary tabular-nums">{percent}%</span>
    </div>
  );
}
