import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: number | null;
  caption?: string;
  icon?: LucideIcon;
}

function formatValue(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString();
}

export function MetricCard({ label, value, caption, icon: Icon }: MetricCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border border-border-subtle bg-surface-1 p-4 shadow-sm sm:p-5",
        "dark:shadow-none"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-muted">{label}</p>
        {Icon ? (
          <Icon className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden />
        ) : null}
      </div>
      <p className="text-3xl font-semibold tracking-tight tabular-nums text-text-primary sm:text-4xl">
        {formatValue(value)}
      </p>
      {caption ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">{caption}</p>
      ) : null}
    </div>
  );
}
