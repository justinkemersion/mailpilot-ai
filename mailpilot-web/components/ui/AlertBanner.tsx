import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type AlertVariant = "success" | "error" | "info";

interface AlertBannerProps {
  variant: AlertVariant;
  children: ReactNode;
  layout?: "standalone" | "inline";
  className?: string;
}

const variantClasses: Record<AlertVariant, string> = {
  success:
    "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
  error:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  info:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
};

export function AlertBanner({
  variant,
  children,
  layout = "standalone",
  className,
}: AlertBannerProps) {
  return (
    <p
      role="alert"
      className={cn(
        "text-sm",
        layout === "standalone"
          ? "rounded-lg border px-4 py-3"
          : "border-b px-4 py-2",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </p>
  );
}
