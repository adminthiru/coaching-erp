import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("block animate-shimmer rounded-full bg-surface-secondary", className)} aria-hidden />;
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-5" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3" style={{ animationDelay: `${i * 150}ms` }}>
          <Skeleton className="size-[30px] shrink-0 rounded-full" />
          <Skeleton className="h-2.5 flex-1" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5" role="status" aria-label="Loading">
      <Skeleton className="h-2.5 w-24" />
      <Skeleton className="h-6 w-32 rounded-md" />
      <Skeleton className="h-2.5 w-20" />
    </div>
  );
}

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2" role="status" aria-label="Loading">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-[38px] rounded-md" />
        </div>
      ))}
    </div>
  );
}
