import { Badge, type BadgeProps } from "@/components/ui/badge";

/** The single source of truth for what a status looks like anywhere in the ERP. */
export const STATUS_VARIANT = {
  active: "success", paid: "success", present: "success", approved: "success",
  pending: "warning", late: "warning", partial: "warning", "half-day": "warning",
  overdue: "error", absent: "error", failed: "error", cancelled: "error",
  upcoming: "info", scheduled: "info",
  enrolled: "primary",
  inactive: "neutral", completed: "neutral", archived: "neutral", draft: "neutral",
} as const;

export type StatusKey = keyof typeof STATUS_VARIANT;

export function StatusBadge({ status, dot }: { status: StatusKey; dot?: boolean }) {
  const variant = STATUS_VARIANT[status] as BadgeProps["variant"];
  return (
    <Badge variant={variant} dot={dot}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}
