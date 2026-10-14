import * as React from "react";
import { cn } from "../../lib/cn";
import { initials as toInitials } from "../../lib/format";

const SIZES = { xs: "size-6 text-[10px]", sm: "size-[30px] text-[11.5px]", md: "size-[38px] text-[13px]", lg: "size-11 text-[15px]" };
const TONES = ["bg-primary-soft text-primary", "bg-info-soft text-info", "bg-success-soft text-success", "bg-warning-soft text-warning"];

export interface AvatarProps {
  name: string;
  src?: string;
  size?: keyof typeof SIZES;
  status?: "online" | "away" | "offline";
  className?: string;
}

export function Avatar({ name, src, size = "sm", status, className }: AvatarProps) {
  const tone = TONES[name.charCodeAt(0) % TONES.length];
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center rounded-full font-semibold", SIZES[size], !src && tone, className)}>
      {src ? (
        <img src={src} alt={name} className="size-full rounded-full object-cover" />
      ) : (
        <span aria-hidden>{toInitials(name)}</span>
      )}
      {status && (
        <span
          aria-label={status}
          className={cn(
            "absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-card",
            status === "online" && "bg-success",
            status === "away" && "bg-warning",
            status === "offline" && "bg-border-strong"
          )}
        />
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}

export function AvatarGroup({ names, max = 3, size = "sm" }: { names: string[]; max?: number; size?: keyof typeof SIZES }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className="flex">
      {shown.map((n, i) => (
        <Avatar key={n} name={n} size={size} className={cn("border-2 border-card", i && "-ml-2.5")} />
      ))}
      {rest > 0 && (
        <span className={cn("grid place-items-center rounded-full border-2 border-card bg-surface-secondary font-semibold text-fg-secondary", SIZES[size], "-ml-2.5")}>
          +{rest}
        </span>
      )}
    </span>
  );
}
