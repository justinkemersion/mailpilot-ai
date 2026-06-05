"use client";

import { TopBar } from "@/components/TopBar";
import { pageTitleForPath, Sidebar } from "@/components/Sidebar";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

interface AppShellProps {
  userLabel: string;
  children: ReactNode;
}

export function AppShell({ userLabel, children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = pageTitleForPath(pathname);

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-zinc-50 dark:bg-zinc-950">
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={title}
          userLabel={userLabel}
          onMenuOpen={() => setMobileOpen(true)}
        />
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
