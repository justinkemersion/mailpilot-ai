import type { ReactNode } from "react";
import { SignOutButton } from "./SignOutButton";

interface DashboardShellProps {
  userLabel: string;
  children: ReactNode;
}

export function DashboardShell({ userLabel, children }: DashboardShellProps) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <h1 className="shrink-0 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              MailPilot
            </h1>
            <div className="flex min-w-0 flex-col gap-2 border-t border-zinc-200 pt-3 sm:shrink-0 sm:flex-row sm:items-center sm:gap-4 sm:border-0 sm:pt-0">
              <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                {userLabel}
              </span>
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
