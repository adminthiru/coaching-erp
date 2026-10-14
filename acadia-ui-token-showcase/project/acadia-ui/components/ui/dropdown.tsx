"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface DropdownItem {
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}

export interface DropdownProps {
  trigger: React.ReactNode;
  items: (DropdownItem | "separator")[];
  heading?: string;
  align?: "start" | "end";
}

/** Action menu for row actions, bulk actions and table settings. */
export function Dropdown({ trigger, items, heading, align = "end" }: DropdownProps) {
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative inline-flex">
      <span onClick={() => setOpen((o) => !o)}>{trigger}</span>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute top-[calc(100%+6px)] z-50 flex min-w-[190px] flex-col gap-px rounded-lg border border-border bg-surface p-1.5 shadow-elevated animate-fade-up",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          {heading && <span className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-muted">{heading}</span>}
          {items.map((item, i) =>
            item === "separator" ? (
              <span key={i} className="my-1.5 h-px bg-border" />
            ) : (
              <button
                key={item.label}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => { item.onSelect(); setOpen(false); }}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-body-sm",
                  item.destructive ? "text-error hover:bg-error-soft" : "text-fg hover:bg-surface-secondary",
                  item.disabled && "cursor-not-allowed text-fg-disabled hover:bg-transparent"
                )}
              >
                {item.icon}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
