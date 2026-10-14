"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Button } from "./button";

/**
 * Terminal failure for a whole panel or page — a request failed, a resource is
 * gone, the user lacks permission.
 *
 * Distinct from <EmptyState> (the request succeeded, there is simply nothing)
 * and from <Alert> (in-flow, the surrounding content still works).
 */
export function ErrorState({
  kind = "error",
  title,
  description,
  onRetry,
  action,
  className,
}: {
  kind?: "error" | "forbidden" | "not-found" | "offline";
  title?: string;
  description?: string;
  onRetry?: () => void;
  action?: React.ReactNode;
  className?: string;
}) {
  const preset = COPY[kind];
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      <span className={cn("grid size-11 place-items-center rounded-full", preset.tone)} aria-hidden>
        {preset.glyph}
      </span>
      <div className="flex max-w-[420px] flex-col gap-1.5">
        <span className="text-h3 text-fg">{title ?? preset.title}</span>
        <span className="text-body-sm text-fg-secondary">{description ?? preset.description}</span>
      </div>
      {(onRetry || action) && (
        <div className="mt-1 flex items-center gap-2">
          {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
          {action}
        </div>
      )}
    </div>
  );
}

const COPY = {
  error: {
    glyph: "!",
    tone: "bg-error-soft text-error text-h2",
    title: "Something went wrong",
    description: "We couldn't load this. The issue has been logged — try again in a moment.",
  },
  forbidden: {
    glyph: "🔒",
    tone: "bg-warning-soft text-warning text-h3",
    title: "You don't have access",
    description: "Your role doesn't permit viewing this. Contact your organization admin if you think this is a mistake.",
  },
  "not-found": {
    glyph: "?",
    tone: "bg-surface-secondary text-fg-muted text-h2",
    title: "Not found",
    description: "This record doesn't exist, or it was archived.",
  },
  offline: {
    glyph: "⚡",
    tone: "bg-surface-secondary text-fg-muted text-h3",
    title: "Connection lost",
    description: "Check your network. Unsaved changes are kept until you reconnect.",
  },
} as const;
