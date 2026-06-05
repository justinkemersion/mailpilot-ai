"use client";

import { TopBar } from "@/components/TopBar";
import { pageTitleForPath, Sidebar } from "@/components/Sidebar";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useState, type ReactNode } from "react";
import { DemoBanner } from "@/components/DemoBanner";

interface AppShellProps {
  userLabel: string;
  showDemoBanner?: boolean;
  children: ReactNode;
}

export function AppShell({
  userLabel,
  showDemoBanner = false,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = pageTitleForPath(pathname);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-zinc-50 dark:bg-zinc-950">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={closeMobile} />
      <div className="flex min-w-0 flex-1 flex-col">
        <a
          href="#dashboard-main"
          className={cn(
            "sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white",
            focusRing
          )}
        >
          Skip to content
        </a>
        <TopBar
          title={title}
          userLabel={userLabel}
          onMenuOpen={() => setMobileOpen(true)}
        />
        <Suspense fallback={null}>
          <DemoBanner showEnvBanner={showDemoBanner} />
        </Suspense>
        <main
          id="dashboard-main"
          className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-8 sm:px-6 sm:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
