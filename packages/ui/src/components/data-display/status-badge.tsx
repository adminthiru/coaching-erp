import { Badge, type BadgeProps } from "../ui/badge";

/**
 * The single source of truth for what a status looks like anywhere in the platform.
 *
 * Status colour is semantic and fixed — healthy/settled reads success, needs-action
 * reads warning, broken/stopped reads error, informational reads info, dormant reads
 * neutral. Adding a status means deciding which of those it *is*, never inventing a
 * new colour. Keys are lowercase; the API's SCREAMING_SNAKE enums are normalised by
 * `toStatusKey` below.
 */
export const STATUS_VARIANT = {
  // Operational / academic (ERP)
  active: "success", paid: "success", present: "success", approved: "success",
  pending: "warning", late: "warning", partial: "warning", "half-day": "warning",
  overdue: "error", absent: "error", failed: "error", cancelled: "error",
  upcoming: "info", scheduled: "info",
  enrolled: "primary",
  inactive: "neutral", completed: "neutral", archived: "neutral", draft: "neutral",

  // Organization lifecycle (spec §11)
  trial: "info",
  "payment due": "warning",
  suspended: "error",
  expired: "error",

  // Branch lifecycle (spec §27)
  "setup required": "warning",
  "temporarily closed": "neutral",

  // Subscription lifecycle (spec §19)
  renewal: "info",
  "past due": "error",

  // Invoices & payments (spec §20)
  open: "info",
  "partially paid": "warning",
  void: "neutral",
  refunded: "neutral",
  "partially refunded": "warning",
  succeeded: "success",

  // Support (spec §22)
  "in progress": "info",
  "waiting on customer": "warning",
  resolved: "success",
  closed: "neutral",

  // Plans
  published: "success",
} as const;

export type StatusKey = keyof typeof STATUS_VARIANT;

/** "PAYMENT_DUE" -> "payment due". Returns null when the status has no mapping. */
export function toStatusKey(status: string): StatusKey | null {
  const key = status.trim().toLowerCase().replace(/_/g, " ");
  return key in STATUS_VARIANT ? (key as StatusKey) : null;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Accepts either a known StatusKey or a raw enum value from the API. An unmapped
 * status still renders — neutral, and readable — rather than throwing or vanishing.
 */
export function StatusBadge({
  status,
  dot,
  label,
}: {
  status: StatusKey | (string & {});
  dot?: boolean;
  label?: string;
}) {
  const key = toStatusKey(String(status));
  const variant = (key ? STATUS_VARIANT[key] : "neutral") as BadgeProps["variant"];
  const text = label ?? titleCase(key ?? String(status).toLowerCase().replace(/_/g, " "));

  return (
    <Badge variant={variant} dot={dot}>
      {text}
    </Badge>
  );
}
