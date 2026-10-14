"use client";

import * as React from "react";

/** Wrap any icon-only control. The trigger must still carry its own aria-label. */
export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-sm bg-fg px-2.5 py-1.5 text-[12px] font-medium text-bg shadow-medium animate-fade-up"
        >
          {label}
        </span>
      )}
    </span>
  );
}
