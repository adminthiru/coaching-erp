"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

type ToastKind = "success" | "error" | "warning" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

const TONE: Record<ToastKind, { box: string; glyph: string }> = {
  success: { box: "bg-success-soft text-success", glyph: "✓" },
  error: { box: "bg-error-soft text-error", glyph: "!" },
  warning: { box: "bg-warning-soft text-warning", glyph: "!" },
  info: { box: "bg-info-soft text-info", glyph: "i" },
};

const ToastContext = React.createContext<{ toast: (t: Omit<Toast, "id">) => void } | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <Toaster>");
  return ctx;
}

/** Mount once in the root layout. */
export function Toaster({ children, duration = 4200 }: { children?: React.ReactNode; duration?: number }) {
  const [items, setItems] = React.useState<Toast[]>([]);

  const toast = React.useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), duration);
  }, [duration]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        role="region"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[95] flex flex-col items-end gap-2.5 sm:inset-x-auto sm:right-6 sm:bottom-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full items-start gap-2.5 rounded-lg border border-border bg-surface p-3.5 shadow-elevated animate-fade-up sm:w-80"
          >
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-sm text-[13px] font-bold", TONE[t.kind].box)}>
              {TONE[t.kind].glyph}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-body-sm font-semibold text-fg">{t.title}</div>
              {t.description && <div className="mt-0.5 text-caption leading-snug text-fg-secondary">{t.description}</div>}
            </div>
            <button
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="Dismiss"
              className="text-fg-muted hover:text-fg"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
