import * as React from "react";

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  filters?: React.ReactNode;
}

export function PageHeader({ title, description, breadcrumbs, actions, tabs, filters }: PageHeaderProps) {
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
        <div>
          <h1 className="text-h2 text-fg">{title}</h1>
          {description && <p className="mt-1 text-body-sm text-fg-secondary">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
      </div>
      {filters && <div className="flex flex-wrap items-center gap-2.5">{filters}</div>}
      {tabs}
    </header>
  );
}
