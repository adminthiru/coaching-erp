"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  width?: number;
  children: React.ReactNode;
}

/** Right by default. Full-width on mobile. Use for record detail, never for forms that navigate. */
export function Drawer({ open, onClose, side = "right", width = 420, children }: DrawerProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className={cn("fixed inset-0 z-[90] flex bg-black/40", side === "right" ? "justify-end" : "justify-start")}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: width }}
        className={cn(
          "flex h-full w-full flex-col bg-surface shadow-elevated animate-slide-left",
          side === "right" ? "border-l border-border" : "border-r border-border"
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-3 border-b border-border px-5 py-5", className)} {...props} />;
}

export function DrawerBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5", className)} {...props} />;
}

export function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-auto flex justify-end gap-2.5 border-t border-border bg-surface-secondary px-5 py-3.5", className)} {...props} />;
}
