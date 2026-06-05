import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
  variant?: "hero" | "inline";
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "hero",
  className,
}: EmptyStateProps) {
  const isHero = variant === "hero";

  return (
    <div
      className={cn(
        "rounded-xl border border-dashed text-center",
        isHero
          ? "border-border-subtle bg-surface-1 px-6 py-10 sm:py-12"
          : "border-zinc-200/80 bg-surface-2/50 px-4 py-8 dark:border-zinc-800/80",
        className
      )}
    >
      <div
        className={cn(
          "mx-auto flex items-center justify-center rounded-full",
          isHero
            ? "h-12 w-12 bg-surface-2"
            : "h-9 w-9 bg-white dark:bg-zinc-900"
        )}
      >
        <Icon
          className={cn(
            "text-text-muted",
            isHero ? "h-6 w-6" : "h-4 w-4"
          )}
          aria-hidden
        />
      </div>
      <p
        className={cn(
          "font-medium text-text-primary",
          isHero ? "mt-4 text-sm" : "mt-3 text-sm"
        )}
      >
        {title}
      </p>
      <p
        className={cn(
          "text-text-muted",
          isHero ? "mt-1 text-sm" : "mt-0.5 text-xs"
        )}
      >
        {description}
      </p>
      {action ? (
        <Link
          href={action.href}
          className={cn(
            "mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover",
            focusRing
          )}
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
