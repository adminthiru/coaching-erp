"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  /** Present once the upload resolves — used for logo/photo previews. */
  url?: string;
  status: "pending" | "uploading" | "done" | "error";
  progress?: number;
  error?: string;
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/**
 * Drag-and-drop / click file input.
 *
 * Client-side `accept` and `maxSize` are conveniences only — the API re-validates
 * MIME type and size on every upload (spec §73, file validation).
 */
export function FileUpload({
  label,
  required,
  hint,
  accept,
  multiple,
  maxSize = 5 * 1024 * 1024,
  files = [],
  onFiles,
  onRemove,
  error,
  disabled,
  className,
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  files?: UploadedFile[];
  onFiles: (files: File[]) => void;
  onRemove?: (id: string) => void;
  error?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [over, setOver] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const input = React.useRef<HTMLInputElement>(null);

  function accepted(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    const tooBig = picked.find((f) => f.size > maxSize);
    if (tooBig) {
      setLocalError(`"${tooBig.name}" is ${humanSize(tooBig.size)} — the limit is ${humanSize(maxSize)}.`);
      return;
    }
    setLocalError(null);
    onFiles(multiple ? picked : picked.slice(0, 1));
  }

  const shown = error ?? localError;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <span className="text-label text-fg">
          {label} {required && <span className="text-error">*</span>}
        </span>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) accepted(e.dataTransfer.files); }}
        onClick={() => !disabled && input.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-5 py-7 text-center transition-colors",
          over ? "border-primary bg-primary-soft" : "border-border-strong bg-surface hover:border-primary",
          shown && "border-error",
          disabled && "cursor-not-allowed bg-surface-secondary opacity-60"
        )}
      >
        <input
          ref={input}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => { accepted(e.target.files); e.target.value = ""; }}
          className="sr-only"
        />
        <span className="grid size-9 place-items-center rounded-full bg-surface-secondary text-fg-muted" aria-hidden>↑</span>
        <span className="text-body-sm text-fg">
          <span className="font-semibold text-primary">Click to upload</span> or drag and drop
        </span>
        <span className="text-caption text-fg-muted">{hint ?? `Up to ${humanSize(maxSize)}`}</span>
      </div>

      {files.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2">
              {f.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt="" className="size-7 shrink-0 rounded-sm object-cover" />
              ) : (
                <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-surface-secondary text-caption text-fg-muted" aria-hidden>
                  {f.name.split(".").pop()?.slice(0, 3).toUpperCase() ?? "?"}
                </span>
              )}

              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-body-sm text-fg">{f.name}</span>
                {f.status === "error" ? (
                  <span className="text-caption text-error">{f.error ?? "Upload failed"}</span>
                ) : f.status === "uploading" ? (
                  <span className="h-1 w-full overflow-hidden rounded-full bg-surface-secondary">
                    <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${f.progress ?? 0}%` }} />
                  </span>
                ) : (
                  <span className="text-caption text-fg-muted">{humanSize(f.size)}</span>
                )}
              </span>

              {f.status === "done" && <span className="shrink-0 text-caption text-success">✓</span>}
              {onRemove && (
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => onRemove(f.id)}
                  className="shrink-0 rounded-sm px-1 text-fg-muted transition-colors hover:text-error"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {shown && <span className="text-caption text-error">{shown}</span>}
    </div>
  );
}
