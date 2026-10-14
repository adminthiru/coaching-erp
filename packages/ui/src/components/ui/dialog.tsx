"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** md for confirmations, lg for form dialogs, full for immersive editors. */
  size?: "md" | "lg" | "full";
}

/** Escape closes, backdrop closes, body scroll locks, mobile becomes a bottom sheet. */
export function Dialog({ open, onClose, children, size = "md" }: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-border bg-surface shadow-elevated animate-sheet-up",
          "sm:rounded-lg sm:animate-fade-up",
          size === "md" && "sm:max-w-[440px]",
          size === "lg" && "sm:max-w-[560px]",
          size === "full" && "sm:max-w-[calc(100vw-96px)] sm:h-[calc(100vh-96px)]"
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ title, description, onClose }: { title: string; description?: string; onClose?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
      <div>
        <h2 className="text-[16px] font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-caption text-fg-secondary">{description}</p>}
      </div>
      {onClose && (
        <button onClick={onClose} aria-label="Close" className="grid size-[30px] place-items-center rounded-md border border-border text-fg-secondary hover:bg-surface-secondary">
          ×
        </button>
      )}
    </div>
  );
}

export function DialogContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-5", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex justify-end gap-2.5 border-t border-border bg-surface-secondary px-6 py-3.5", className)} {...props} />;
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** Say what happens and whether it can be undone. */
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  /**
   * One field the decision needs — almost always the reason a destructive action
   * is being taken, which the API records in the audit log. Keep it to a single
   * input; anything more belongs in a <Drawer>, not a confirmation.
   */
  children?: React.ReactNode;
  /** Blocks the confirm button until the caller's own condition is met. */
  confirmDisabled?: boolean;
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, description, confirmLabel = "Confirm", destructive, loading,
  children, confirmDisabled,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose}>
      <div className="flex items-start gap-3.5 px-6 pt-6">
        {destructive && (
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-error-soft text-error" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M8 4.6v4.2M8 11.2h.01" />
              <circle cx="8" cy="8" r="6.2" />
            </svg>
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-fg">{title}</h2>
          <p className="mt-1.5 text-body-sm leading-relaxed text-fg-secondary">{description}</p>
        </div>
      </div>

      {children && <div className="px-6 pt-4">{children}</div>}

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          variant={destructive ? "destructive" : "primary"}
          loading={loading}
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
