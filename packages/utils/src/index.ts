/**
 * Framework-free helpers shared by the API and both frontends.
 * Nothing here may import React, Prisma or Nest.
 */

/* ── Money ──────────────────────────────────────────────────────────────── */

/**
 * All money crosses the wire and rests in the database as an integer count of
 * the minor unit (paise). Floats never touch a currency value.
 */
export const toMinor = (major: number) => Math.round(major * 100);
export const toMajor = (minor: number) => minor / 100;

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** 2500000 (paise) -> "₹25,000" */
export function formatMinor(minor: number, currency = "INR") {
  const major = toMajor(minor);
  const symbol = currency === "INR" ? "₹" : `${currency} `;
  const sign = major < 0 ? "−" : "";
  return `${sign}${symbol}${INR.format(Math.abs(major))}`;
}

/** 125000000 (paise) -> "₹12.5L" — headline KPIs only, never invoices. */
export function formatMinorCompact(minor: number, currency = "INR") {
  const v = toMajor(minor);
  const a = Math.abs(v);
  const symbol = currency === "INR" ? "₹" : `${currency} `;
  const sign = v < 0 ? "−" : "";
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  if (a >= 1e7) return `${sign}${symbol}${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}${symbol}${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}${symbol}${trim(a / 1e3)}K`;
  return `${sign}${symbol}${INR.format(a)}`;
}

/* ── Dates ──────────────────────────────────────────────────────────────── */

export const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const target = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(target);
  // Clamp: 31 Jan + 1 month is 28/29 Feb, not 2/3 Mar.
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Whole days from `a` to `b`; negative when `b` is in the past. */
export function daysBetween(a: Date, b: Date) {
  const ms = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
    Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  return Math.round(ms / 864e5);
}

export const isExpired = (at: Date | string | null | undefined, now = new Date()) =>
  at ? new Date(at).getTime() <= now.getTime() : false;

/* ── Text ───────────────────────────────────────────────────────────────── */

export function slugify(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function initials(name: string) {
  return name.trim().split(/\s+/).map((p) => p[0] ?? "").join("").slice(0, 2).toUpperCase();
}

/** Redacts a value for logs — "npg_rFo6…jvsI". Never log the raw secret. */
export function maskSecret(value: string, keep = 4) {
  if (value.length <= keep * 2) return "…";
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

/* ── Numbers ────────────────────────────────────────────────────────────── */

export const percent = (n: number, digits = 0) => `${n.toFixed(digits)}%`;

/** Percentage change from `previous` to `current`, guarding the zero baseline. */
export function pctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/* ── Entitlements ───────────────────────────────────────────────────────── */

/**
 * A `null` limit means unlimited. `used >= limit` blocks; the caller decides
 * whether to warn at `nearLimit`.
 */
export function quota(used: number, limit: number | null) {
  if (limit === null) return { used, limit, unlimited: true, pct: 0, exceeded: false, nearLimit: false };
  const pct = limit === 0 ? 100 : (used / limit) * 100;
  return { used, limit, unlimited: false, pct, exceeded: used >= limit, nearLimit: pct >= 80 };
}

/* ── Misc ───────────────────────────────────────────────────────────────── */

export function groupBy<T, K extends string | number>(items: T[], key: (item: T) => K) {
  return items.reduce((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

export const unique = <T>(items: T[]) => Array.from(new Set(items));

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}


/* ── Timetable clock helpers ────────────────────────────────────────────── */

/**
 * Times in the timetable are minutes from midnight. A weekly grid has no date to
 * anchor a timezone to, so storing a real TIME would imply a precision that does
 * not exist — and integer overlap maths is exact.
 */

/** "09:30" -> 570. Returns null for anything that is not HH:MM. */
export function parseClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 570 -> "09:30" */
export function formatClock(minute: number) {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 570 -> "9:30 am" — for display, never for storage. */
export function formatClock12(minute: number) {
  const h24 = Math.floor(minute / 60);
  const m = minute % 60;
  const suffix = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * Half-open overlap: a class ending at 10:00 and one starting at 10:00 do not
 * clash. Using closed intervals here would flag every back-to-back period.
 */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export const durationMinutes = (start: number, end: number) => Math.max(0, end - start);
