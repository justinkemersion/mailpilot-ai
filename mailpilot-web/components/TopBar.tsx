"use client";

import { SignOutButton } from "@/app/dashboard/SignOutButton";
import { Menu } from "lucide-react";

interface TopBarProps {
  title: string;
  userLabel: string;
  onMenuOpen: () => void;
}

export function TopBar({ title, userLabel, onMenuOpen }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="flex min-h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onMenuOpen}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 lg:hidden dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <h1 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h1>
        </div>
        <div className="flex min-w-0 shrink-0 items-center gap-3 sm:gap-4">
          <span className="hidden truncate text-sm text-zinc-500 sm:inline dark:text-zinc-400">
            {userLabel}
          </span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
