import * as React from "react";
import { cn } from "../../lib/cn";

/**
 * A titled group of fields.
 *
 * This is **not a card**. Every FormSection in this app lives inside a
 * `<FormModal>`, and a bordered card inside a modal is a box drawn inside a
 * box: it repeated the modal's own chrome, ate horizontal room with a second
 * set of 24px paddings, added height that pushed fields under the fold, and —
 * because it carried `overflow-hidden` — clipped any dropdown that opened near
 * its edge. It is now a heading and its fields, separated from the next group
 * by a rule.
 *
 * `gap-5` matches FormRow's own gap, so vertical rhythm between rows equals the
 * horizontal rhythm between fields. Without it an input butts straight into the
 * next row's label and the spacing reads as uneven.
 */
export function FormSection({
  title, description, aside, children, className,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4 border-b border-border pb-5 last:border-0 last:pb-0", className)}>
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h3 className="text-label font-semibold text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-caption text-fg-muted">{description}</p>}
        </div>
        {aside}
      </header>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

/** Auto-collapses to a single column below 640px — never a shrunken desktop grid. */
export function FormRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-5 sm:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]", className)}>{children}</div>;
}

export function FormField({ span, children }: { span?: "full"; children: React.ReactNode }) {
  return <div className={cn("flex flex-col", span === "full" && "sm:col-span-full")}>{children}</div>;
}

export function FormFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2.5 border-t border-border bg-surface-secondary px-6 py-4">{children}</div>;
}
