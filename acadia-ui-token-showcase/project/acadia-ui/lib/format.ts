/** Single formatting strategy for the whole ERP. Never format inline in a page. */

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** 25000 -> "₹25,000" ; 0 -> "—" */
export function currency(value: number, opts: { dash?: boolean; sign?: boolean } = {}) {
  if (value === 0 && opts.dash !== false) return "—";
  const sign = opts.sign ? (value > 0 ? "+" : value < 0 ? "−" : "") : value < 0 ? "−" : "";
  return `${sign}₹${INR.format(Math.abs(value))}`;
}

/** 1250000 -> "₹12.5L" — for KPI headlines only, never for invoices. */
export function currencyCompact(value: number) {
  const a = Math.abs(value);
  if (a >= 1e7) return `₹${(value / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (a >= 1e5) return `₹${(value / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  if (a >= 1e3) return `₹${(value / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return currency(value, { dash: false });
}

const DATE = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const DATETIME = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });

/** "18 Aug 2026" */
export const formatDate = (d: Date | string) => DATE.format(new Date(d));
/** "18 Aug, 6:00 pm" */
export const formatDateTime = (d: Date | string) => DATETIME.format(new Date(d));

/** "4 days ago" */
export function relativeTime(d: Date | string) {
  const diff = Date.now() - new Date(d).getTime();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536e6], ["month", 2592e6], ["day", 864e5], ["hour", 36e5], ["minute", 6e4],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms) return rtf.format(-Math.round(diff / ms), unit);
  }
  return "just now";
}

export function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

export function percent(n: number) {
  return `${Math.round(n)}%`;
}
