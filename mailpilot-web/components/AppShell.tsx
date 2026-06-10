"use client";

import { TopBar } from "@/components/TopBar";
import { pageTitleForPath, Sidebar } from "@/components/Sidebar";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { DemoBanner } from "@/components/DemoBanner";

interface AppShellProps {
  userLabel: string;
  showDemoBanner?: boolean;
  isDemoUser?: boolean;
  children: ReactNode;
}

export function AppShell({
  userLabel,
  showDemoBanner = false,
  isDemoUser = false,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = pageTitleForPath(pathname);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [router]);

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-surface-base">
      <Sidebar
        userLabel={userLabel}
        isDemoUser={isDemoUser}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
      />
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
        <TopBar title={title} isDemoUser={isDemoUser} onMenuOpen={() => setMobileOpen(true)} />
        <Suspense fallback={null}>
          <DemoBanner showBanner={showDemoBanner} />
        </Suspense>
        <main
          id="dashboard-main"
          className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-6 sm:px-6 sm:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
