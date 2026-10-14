"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Button } from "./button";

export interface FormModalStep {
  /** Shown in the step rail. Keep it to one or two words. */
  label: string;
  /** Optional one-line hint under the heading while this step is active. */
  hint?: string;
  content: React.ReactNode;
  /**
   * Blocks **Next** until this step is valid. Omit to always allow forward.
   * Never block the final submit here — use the modal's `canSubmit` so the
   * reason a submit is disabled lives in one place.
   */
  canContinue?: boolean;
}

export interface FormModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** sm 420 · md 560 · lg 680 · xl 820 — pick by content, not by habit. */
  size?: "sm" | "md" | "lg" | "xl";
  children?: React.ReactNode;
  /** Single-shot forms: supply your own footer, exactly as <Drawer> took one. */
  footer?: React.ReactNode;
  /** Multi-step forms: supply steps and the footer is built for you. */
  steps?: FormModalStep[];
  onSubmit?: () => void;
  submitLabel?: string;
  canSubmit?: boolean;
  busy?: boolean;
  /** Rendered above the body on every step — for a form-level error or notice. */
  banner?: React.ReactNode;
}

const WIDTH: Record<NonNullable<FormModalProps["size"]>, string> = {
  sm: "sm:max-w-[420px]",
  md: "sm:max-w-[560px]",
  lg: "sm:max-w-[680px]",
  xl: "sm:max-w-[820px]",
};

/**
 * The centred surface for creating things.
 *
 * A right-hand drawer is a narrow column the full height of the viewport, which
 * suits a short edit and fights a long form: fields clip at the fold and the
 * eye travels further between label and control. A centred modal is wider, so
 * two-column rows fit, and it is capped in height with its own scroll region —
 * the header and the actions stay put while only the fields move.
 *
 * Long forms take `steps`. Splitting a form is not decoration: it keeps every
 * screen short enough to complete without scrolling, and it gives validation
 * somewhere to happen before the last click rather than all at the end.
 *
 * On small screens this becomes a near-full-height sheet, because a centred box
 * with a keyboard open is unusable.
 */
export function FormModal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
  steps,
  onSubmit,
  submitLabel = "Save",
  canSubmit = true,
  busy = false,
  banner,
}: FormModalProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const [index, setIndex] = React.useState(0);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  const stepped = Array.isArray(steps) && steps.length > 0;
  const last = stepped ? index === steps!.length - 1 : true;

  // Re-opening must not resume halfway through a form the user abandoned.
  React.useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // A new step starts at its own top, not wherever the previous one was left.
  React.useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [index]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const step = stepped ? steps![index] : null;
  const blocked = step?.canContinue === false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          // Height is capped so the body — not the page — is what scrolls.
          // `overflow-hidden` clips the footer and step rail to the rounded
          // corners: both paint `bg-surface-secondary`, so without it their
          // square corners bled past the radius. Safe because the scrolling
          // body owns its own overflow and every menu is portalled to <body>,
          // so nothing that needs to escape this box lives inside it.
          "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-surface shadow-elevated",
          "animate-sheet-up sm:max-h-[86vh] sm:rounded-lg sm:animate-fade-up",
          WIDTH[size],
        )}
      >
        {/* Header — fixed */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={titleId} className="text-h3 text-fg">{title}</h2>
            {(step?.hint ?? description) && (
              <p id={descriptionId} className="text-caption text-fg-secondary">
                {step?.hint ?? description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-[30px] shrink-0 place-items-center rounded-md border border-border text-fg-secondary transition-colors hover:bg-surface-secondary"
          >
            ×
          </button>
        </div>

        {stepped && <StepRail steps={steps!} index={index} onJump={setIndex} />}

        {/* Body — the only scrolling region */}
        <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {banner}
          {stepped ? step!.content : children}
        </div>

        {/* Footer — fixed, so the primary action is never scrolled away */}
        <div className="flex items-center justify-between gap-2.5 border-t border-border bg-surface-secondary px-6 py-3.5">
          {stepped ? (
            <>
              <span className="text-caption text-fg-muted sm:hidden">
                Step {index + 1} of {steps!.length}
              </span>
              <span className="hidden sm:block" />
              <div className="flex items-center gap-2.5">
                <Button
                  variant="outline"
                  onClick={index === 0 ? onClose : () => setIndex((i) => i - 1)}
                  disabled={busy}
                >
                  {index === 0 ? "Cancel" : "Back"}
                </Button>
                {last ? (
                  <Button onClick={onSubmit} loading={busy} disabled={!canSubmit}>
                    {submitLabel}
                  </Button>
                ) : (
                  <Button onClick={() => setIndex((i) => i + 1)} disabled={blocked}>
                    Next
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="flex w-full items-center justify-end gap-2.5">{footer}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The step rail. Completed steps are clickable so a correction does not mean
 * cancelling; steps ahead are not, because skipping validation forward is how
 * half-filled records get created.
 */
function StepRail({
  steps, index, onJump,
}: {
  steps: FormModalStep[];
  index: number;
  onJump: (i: number) => void;
}) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface-secondary px-6 py-3">
      {steps.map((s, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li key={s.label} className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => done && onJump(i)}
              disabled={!done}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1 text-body-sm transition-colors",
                done && "cursor-pointer text-fg-secondary hover:bg-surface",
                active && "text-fg",
                !done && !active && "cursor-default text-fg-muted",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-[22px] shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors",
                  active && "border-primary bg-primary text-primary-fg",
                  done && "border-success bg-success text-white",
                  !active && !done && "border-border-strong bg-surface text-fg-muted",
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={cn("whitespace-nowrap", active ? "font-medium" : "")}>{s.label}</span>
            </button>
            {i < steps.length - 1 && (
              <span aria-hidden className="h-px w-4 shrink-0 bg-border-strong sm:w-6" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
