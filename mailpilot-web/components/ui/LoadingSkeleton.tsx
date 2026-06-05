import { cn } from "@/lib/utils";

interface LoadingSkeletonProps {
  variant?: "table" | "card" | "metric";
  rows?: number;
  className?: string;
}

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800",
        className
      )}
      aria-hidden
    />
  );
}

export function LoadingSkeleton({
  variant = "table",
  rows = 4,
  className,
}: LoadingSkeletonProps) {
  if (variant === "metric") {
    return (
      <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="space-y-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="h-8 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={cn("space-y-3", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="flex gap-3">
              <SkeletonBar className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBar className="h-4 w-32" />
                <SkeletonBar className="h-3 w-48" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800",
        className
      )}
      role="status"
      aria-label="Loading"
    >
      <div className="space-y-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
        <SkeletonBar className="h-11 w-full" />
        <div className="flex gap-2">
          <SkeletonBar className="h-7 w-14 rounded-full" />
          <SkeletonBar className="h-7 w-20 rounded-full" />
          <SkeletonBar className="h-7 w-16 rounded-full" />
        </div>
      </div>
      <div className="space-y-0 divide-y divide-zinc-100 dark:divide-zinc-800">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-3 px-4 py-3">
            <SkeletonBar className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBar className="h-4 w-40" />
              <SkeletonBar className="h-3 w-full max-w-sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
