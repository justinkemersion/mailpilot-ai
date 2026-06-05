import { cn } from "@/lib/utils";

type StatusBadgeStatus = "enabled" | "disabled" | "pending" | "running" | "done" | "failed";

const STATUS_STYLES: Record<
  StatusBadgeStatus,
  { dot: string; text: string; label: string }
> = {
  enabled: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    label: "Processing on",
  },
  disabled: {
    dot: "bg-zinc-400 dark:bg-zinc-500",
    text: "text-zinc-600 dark:text-zinc-400",
    label: "Paused",
  },
  pending: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    label: "Pending",
  },
  running: {
    dot: "bg-indigo-500",
    text: "text-indigo-700 dark:text-indigo-400",
    label: "Running",
  },
  done: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    label: "Done",
  },
  failed: {
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    label: "Failed",
  },
};

interface StatusBadgeProps {
  status: StatusBadgeStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        style.text,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} aria-hidden />
      {style.label}
    </span>
  );
}
