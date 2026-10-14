import * as React from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}

export function EmptyState({ title, description, icon, action, secondaryAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-5 py-12 text-center">
      {icon && (
        <span className="grid size-[42px] place-items-center rounded-lg border border-border bg-surface-secondary text-fg-muted">
          {icon}
        </span>
      )}
      <div className="text-h4 text-fg">{title}</div>
      {description && <p className="max-w-[320px] text-body-sm leading-relaxed text-fg-secondary">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-1.5 flex flex-wrap justify-center gap-2.5">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
