"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const alertVariants = cva("flex gap-3 rounded-lg border px-4 py-3", {
  variants: {
    tone: {
      info: "border-info/30 bg-info-soft",
      success: "border-success/30 bg-success-soft",
      warning: "border-warning/30 bg-warning-soft",
      error: "border-error/30 bg-error-soft",
      neutral: "border-border bg-surface-secondary",
    },
  },
  defaultVariants: { tone: "info" },
});

const GLYPH_TONE = {
  info: "bg-info text-white",
  success: "bg-success text-white",
  warning: "bg-warning text-white",
  error: "bg-error text-white",
  neutral: "bg-fg-muted text-white",
};

const GLYPH = { info: "i", success: "✓", warning: "!", error: "!", neutral: "i" };

export interface AlertProps extends VariantProps<typeof alertVariants> {
  title?: string;
  children?: React.ReactNode;
  /** Rendered right-aligned — e.g. an [Upgrade Plan] button on a limit warning. */
  action?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Inline, in-flow message. Use for plan-limit warnings (spec §15), blocking
 * validation summaries and recoverable errors.
 *
 * This is not a toast: a toast is transient and out-of-flow, an Alert stays
 * anchored to the thing it describes.
 */
export function Alert({ tone = "info", title, children, action, onDismiss, className }: AlertProps) {
  const key = (tone ?? "info") as keyof typeof GLYPH;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn(alertVariants({ tone }), className)}>
      <span className={cn("mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full text-[11px] font-bold", GLYPH_TONE[key])} aria-hidden>
        {GLYPH[key]}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <span className="text-h4 text-fg">{title}</span>}
        {children && <div className="text-body-sm text-fg-secondary">{children}</div>}
      </div>

      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 size-6 shrink-0 rounded-sm text-fg-muted transition-colors hover:bg-black/5 hover:text-fg"
        >
          ✕
        </button>
      )}
    </div>
  );
}
