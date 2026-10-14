# Acadia UI — Coaching Center ERP design system

Next.js (App Router) + TypeScript + Tailwind CSS + class-variance-authority.
Cobalt palette, light + dark, semantic tokens only.

## Install

```bash
npm i class-variance-authority clsx tailwind-merge lucide-react
```

## Wire up

1. Copy `styles/tokens.css` into your app and import it in `app/layout.tsx`:
   `import "@/styles/tokens.css";`
2. Merge `tailwind.config.ts` into your config (the `theme.extend` block).
3. Copy `lib/` and `components/` into your `src/` (or root) directory.
4. Put `<Toaster />` once in your root layout.
5. Dark mode: `<html data-theme="dark">` — nothing else changes.

## Rules

- Never hardcode a hex. Use `bg-surface`, `text-muted`, `border-border-strong`, etc.
- Status colour is semantic and fixed: paid/present = success, pending/late = warning,
  overdue/absent = error. Branding changes `--primary` only.
- Radius: inputs & buttons `rounded-md` (10px), cards & modals `rounded-lg`/`rounded-xl`,
  pills only for badges, tags and filter chips.
- Elevation: border first. Shadow only when a surface floats above another.
- Compose, never fork. There is one `<Button>`, not a `StudentButton`.

## Structure

```
components/
  ui/         button input select textarea checkbox switch badge card avatar
              dialog drawer dropdown tabs tooltip toast skeleton empty-state
              pagination segmented
  layout/     sidebar page-header
  forms/      form-section form-row form-field
  data-display/ data-table metric-card status-badge currency attendance-cell
lib/          cn.ts format.ts
styles/       tokens.css
```
