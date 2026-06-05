"use client";

import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Info, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

interface DemoBannerProps {
  /** Set from server via isDemoBannerEnabled() — banner UI only, not data routing. */
  showEnvBanner: boolean;
}

export function DemoBanner({ showEnvBanner }: DemoBannerProps) {
  const searchParams = useSearchParams();
  const fromQuery = searchParams.get("demo") === "true";
  const [dismissed, setDismissed] = useState(false);

  const show = !dismissed && (showEnvBanner || fromQuery);
  if (!show) return null;

  return (
    <div
      className="border-b border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950/50"
      role="status"
    >
      <div className="mx-auto flex max-w-6xl items-start gap-3">
        <Info
          className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400"
          aria-hidden
        />
        <p className="min-w-0 flex-1 text-sm text-indigo-900 dark:text-indigo-100">
          <span className="font-medium">Demo mode</span> — sample data only. Gmail
          connect, sync, and undo are disabled. Sign in and connect your own accounts
          to use MailPilot with real mail.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className={cn(
            "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-indigo-600 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-900/60",
            focusRing
          )}
          aria-label="Dismiss demo banner"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
