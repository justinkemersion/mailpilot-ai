import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import Link from "next/link";

export function DemoOverviewCard() {
  return (
    <div
      className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 dark:border-indigo-900/80 dark:bg-indigo-950/30"
      role="status"
    >
      <div className="flex gap-3">
        <Info
          className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400"
          aria-hidden
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-indigo-950 dark:text-indigo-100">
            Sample inbox preview
          </p>
          <p className="text-sm text-indigo-900/90 dark:text-indigo-200/90">
            You&apos;re viewing Chris&apos;s sample inbox. No Gmail account is
            connected in demo mode — all metrics and activity use fixture data.
          </p>
        </div>
      </div>
    </div>
  );
}

interface DemoConnectNoticeProps {
  className?: string;
}

export function DemoConnectNotice({ className }: DemoConnectNoticeProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border-subtle bg-surface-1 p-4 text-sm text-text-muted",
        className
      )}
    >
      <p>
        Demo mode uses sample Gmail data. Sign in with your own account to
        connect Gmail and run real syncs.
      </p>
      <Link
        href="/demo/exit?next=/login"
        className={cn(
          "mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover",
          focusRing
        )}
      >
        Sign in with your account
      </Link>
    </div>
  );
}
