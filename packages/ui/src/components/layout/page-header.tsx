import * as React from "react";

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  filters?: React.ReactNode;
  /**
   * Shows a back control beside the title. Every detail screen should pass it:
   * breadcrumbs say where you are, but they are small, and a reader arriving
   * from a row click wants one obvious way out. `onBack` is preferred over a
   * bare href so the caller can use the router and keep the SPA transition.
   */
  onBack?: () => void;
  backLabel?: string;
}

export function PageHeader({
  title, description, breadcrumbs, actions, tabs, filters, onBack, backLabel = "Back",
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3.5 px-5 pt-5 lg:px-6">
      {breadcrumbs && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-caption text-fg-muted">
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={b.label}>
              {i > 0 && <span aria-hidden>/</span>}
              {b.href ? <a href={b.href} className="hover:text-fg">{b.label}</a> : <span className="text-fg-secondary">{b.label}</span>}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3.5">
        <div className="flex min-w-0 items-start gap-2.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              title={backLabel}
              className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface text-fg-secondary transition-colors hover:bg-surface-secondary hover:text-fg"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10 3.5 5.5 8l4.5 4.5" />
              </svg>
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-h2 text-fg">{title}</h1>
            {description && <p className="mt-1 text-body-sm text-fg-secondary">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
      </div>
      {filters && <div className="flex flex-wrap items-center gap-2.5">{filters}</div>}
      {tabs}
    </header>
  );
}
