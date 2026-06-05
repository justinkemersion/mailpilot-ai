import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900",
        className
      )}
    >
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <Icon className="h-5 w-5 text-zinc-400 dark:text-zinc-500" aria-hidden />
      </div>
      <p className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {title}
      </p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      {action ? (
        <Link
          href={action.href}
          className={cn(
            "mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200",
            focusRing
          )}
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
