import * as React from "react";
import { cn } from "@/lib/cn";

/** Spacious, scannable forms. Never nest a FormSection inside a FormSection. */
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
    <section className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      <header className="flex items-baseline justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-h4 text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-caption text-fg-muted">{description}</p>}
        </div>
        {aside}
      </header>
      <div className="px-6 py-6">{children}</div>
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
