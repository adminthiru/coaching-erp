'use client';

import * as React from 'react';
import { cn, useToast } from '@acadia/ui';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';

/**
 * Spec §32. Lists only branches the server says this user may reach, and offers
 * "All Branches" only to a cross-branch role — a Branch Admin sees a single
 * entry and no all-branch option.
 */
export function BranchSwitcher() {
  const { organization, branches, activeBranch, scope, switchBranch } = useSession();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const canSelectAll = scope?.canSelectAllBranches ?? false;
  // With one branch and no all-branch option there is nothing to switch between.
  const interactive = branches.length > 1 || canSelectAll;

  const subtitle = activeBranch ? activeBranch.name : canSelectAll ? 'All branches' : 'No branch';

  async function pick(branchId: string | null) {
    setOpen(false);
    setBusy(true);
    try {
      await switchBranch(branchId);
    } catch (err) {
      toast({
        kind: 'error',
        title: 'Could not switch branch',
        description: err instanceof ApiError ? err.message : 'Something went wrong.',
      });
    } finally {
      setBusy(false);
    }
  }

  const chip = (
    <>
      <span className="grid size-[26px] shrink-0 place-items-center rounded-[9px] bg-primary text-[12px] font-bold text-primary-fg">
        {(organization?.name ?? 'A').charAt(0).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[12.5px] font-semibold text-fg">{organization?.name ?? 'Organization'}</span>
        <span className="truncate text-[10.5px] text-fg-muted">{busy ? 'Switching…' : subtitle}</span>
      </span>
      {interactive && (
        <svg
          width="12" height="12" viewBox="0 0 16 16" fill="none"
          stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round"
          aria-hidden className="shrink-0"
        >
          <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
        </svg>
      )}
    </>
  );

  const chipClass = 'flex w-full items-center gap-[9px] rounded-[9px] border border-border bg-surface px-2 py-1.5 text-left';

  if (!interactive) return <div className={chipClass}>{chip}</div>;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={busy}
        className={cn(chipClass, 'transition-colors hover:border-border-strong')}
      >
        {chip}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Switch branch"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 flex max-h-[300px] flex-col gap-px overflow-y-auto rounded-lg border border-border bg-surface p-1.5 shadow-elevated"
        >
          {canSelectAll && (
            <li>
              <Option
                label="All branches"
                meta={`${branches.length} branch${branches.length === 1 ? '' : 'es'}`}
                selected={activeBranch === null}
                onSelect={() => pick(null)}
              />
            </li>
          )}
          {canSelectAll && branches.length > 0 && <li className="my-1 h-px bg-border" aria-hidden />}
          {branches.map((b) => (
            <li key={b.id}>
              <Option
                label={b.name}
                meta={`${b.code} · ${b.city}`}
                selected={activeBranch?.id === b.id}
                onSelect={() => pick(b.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Option({
  label, meta, selected, onSelect,
}: {
  label: string;
  meta: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center justify-between gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-secondary',
        selected && 'bg-primary-soft',
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className={cn('truncate text-body-sm', selected ? 'font-semibold text-primary' : 'text-fg')}>
          {label}
        </span>
        <span className="truncate text-caption text-fg-muted">{meta}</span>
      </span>
      {selected && <span className="shrink-0 text-primary">✓</span>}
    </button>
  );
}
