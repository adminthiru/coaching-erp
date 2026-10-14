"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  width?: number;
  /**
   * When supplied, the drawer renders the standard header/body/footer frame and
   * `children` become the body. Omit all three to compose the parts by hand with
   * <DrawerHeader> / <DrawerBody> / <DrawerFooter> — the app shell does this for
   * the mobile navigation rail.
   */
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Right by default. Full-width on mobile.
 *
 * **Creating and editing now use `<FormModal>`, not this.** A drawer is a narrow
 * full-height column: long forms clip at the fold, which is what sent every add
 * form to a centred modal. What is left here is the unframed variant the app
 * shell uses for the mobile navigation rail, plus the framed variant for any
 * genuinely peripheral panel that should not take the screen's centre.
 */
export function Drawer({
  open, onClose, side = "right", width = 420, title, description, footer, children,
}: DrawerProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);

    // The page behind a modal surface must not scroll with it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const framed = title !== undefined || footer !== undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
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
        {framed ? (
          <>
            <DrawerHeader>
              <div className="flex min-w-0 flex-col gap-0.5">
                {title && <h2 id={titleId} className="text-h3 text-fg">{title}</h2>}
                {description && <p id={descriptionId} className="text-caption text-fg-muted">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 grid size-7 shrink-0 place-items-center rounded-sm text-fg-muted transition-colors hover:bg-surface-secondary hover:text-fg"
              >
                ✕
              </button>
            </DrawerHeader>
            <DrawerBody>{children}</DrawerBody>
            {footer && <DrawerFooter>{footer}</DrawerFooter>}
          </>
        ) : (
          children
        )}
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
