"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

/**
 * A menu that no ancestor can clip.
 *
 * An absolutely-positioned dropdown is clipped by any scrolling or
 * `overflow-hidden` ancestor — which inside a modal body means every dropdown
 * near the fold was cut off. This renders into `document.body` and positions
 * itself with `position: fixed` from the trigger's own rect, so the only thing
 * that can bound it is the viewport.
 *
 * It also flips above the trigger when there is more room up than down, so a
 * select near the bottom of a modal opens upward instead of off-screen.
 */
export function FloatingMenu({
  anchorRef, open, onClose, children, className, maxHeight = 260, matchWidth = true,
  align = "start", minWidth = 190,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  maxHeight?: number;
  /** Match the trigger's width — right for selects, wrong for action menus. */
  matchWidth?: boolean;
  /**
   * Which edge the menu lines up with. A row-action `⋯` sits at the right of a
   * table, so `end` keeps its menu on screen; a select grows from its left.
   */
  align?: "start" | "end";
  /** Used only to decide whether a `start`-aligned menu still fits. */
  minWidth?: number;
}) {
  const [style, setStyle] = React.useState<React.CSSProperties | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const place = React.useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const below = window.innerHeight - r.bottom - gap;
    const above = r.top - gap;
    // Open upward only when below genuinely cannot hold the menu and above is better.
    const flip = below < Math.min(maxHeight, 180) && above > below;
    const height = Math.min(maxHeight, flip ? above : below);

    // Horizontal placement. Anchoring by `right` for an end-aligned menu lets
    // it grow leftward from the trigger without having to measure its width
    // first — which is what keeps a row-action menu on screen when its `⋯`
    // button sits hard against the right edge of a table.
    const margin = 8;
    const vw = document.documentElement.clientWidth;
    const wantsEnd =
      align === "end" ||
      // A start-aligned menu that cannot fit flips to end rather than running
      // off the edge.
      (!matchWidth && vw - r.left - margin < minWidth);

    const horizontal: React.CSSProperties = wantsEnd
      ? { right: Math.max(margin, vw - r.right), maxWidth: Math.max(160, r.right - margin) }
      : { left: Math.max(margin, Math.min(r.left, vw - margin)), maxWidth: Math.max(160, vw - r.left - margin) };

    setStyle({
      position: "fixed",
      top: flip ? undefined : r.bottom + gap,
      bottom: flip ? window.innerHeight - r.top + gap : undefined,
      maxHeight: Math.max(120, height),
      ...horizontal,
      // A select matches its field's width; an action menu is sized by its
      // longest label, so it only needs a floor.
      ...(matchWidth ? { width: r.width } : { minWidth: Math.max(r.width, minWidth) }),
    });
  }, [anchorRef, maxHeight, matchWidth, align, minWidth]);

  React.useLayoutEffect(() => {
    if (!open) return;
    place();

    // Reposition rather than drift: the trigger moves when its own container
    // scrolls, and `capture` catches that on any ancestor, not just the window.
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, place, onClose, anchorRef]);

  if (!open || typeof document === "undefined" || !style) return null;

  return createPortal(
    <div
      ref={menuRef}
      data-floating-menu=""
      style={style}
      // Above the modal's z-[90] — a menu opened from inside a modal must sit
      // over it, not behind it.
      className={cn(
        "z-[120] overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface p-1.5 shadow-elevated",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
