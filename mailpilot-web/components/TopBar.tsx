"use client";

import { SignOutButton } from "@/app/dashboard/SignOutButton";
import { BrandMark } from "@/components/BrandMark";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Menu, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface TopBarProps {
  title: string;
  isDemoUser?: boolean;
  onMenuOpen: () => void;
}

export function TopBar({ title, isDemoUser = false, onMenuOpen }: TopBarProps) {
  const pathname = usePathname();
  const onOverview =
    pathname === "/dashboard/overview" ||
    pathname.startsWith("/dashboard/overview/");

  const syncLinkClass = cn(
    "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-accent transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-950/40",
    focusRing
  );

  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface-1/95 backdrop-blur">
      <div className="flex min-h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onMenuOpen}
            className={cn(
              "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 lg:hidden dark:text-zinc-400 dark:hover:bg-zinc-800",
              focusRing
            )}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <BrandMark size="sm" className="lg:hidden" />
          <div className="min-w-0">
            <p className="hidden text-xs text-text-muted lg:block">Dashboard</p>
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-base font-semibold text-text-primary">
                {title}
              </h1>
              {isDemoUser ? (
                <span className="hidden shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 sm:inline dark:bg-indigo-950 dark:text-indigo-300">
                  Demo
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {onOverview ? (
            <a href="#sync" className={syncLinkClass}>
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
              <span>Sync</span>
            </a>
          ) : (
            <Link href="/dashboard/overview#sync" className={syncLinkClass}>
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
              <span>Sync</span>
            </Link>
          )}
          <SignOutButton className="lg:hidden" />
        </div>
      </div>
    </header>
  );
}
