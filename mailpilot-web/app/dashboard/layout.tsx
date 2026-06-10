import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth/session";
import {
  isDemoBannerEnabled,
  isDemoCookieSession,
  isDemoUser,
  isGlobalDemoMode,
} from "@/lib/demo";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const demoUser = isDemoUser(user);
  const showDemoBanner =
    demoUser ||
    isGlobalDemoMode() ||
    isDemoBannerEnabled() ||
    (await isDemoCookieSession());

  return (
    <AppShell
      userLabel={user.name ?? user.email ?? "User"}
      showDemoBanner={showDemoBanner}
      isDemoUser={demoUser}
    >
      {children}
    </AppShell>
  );
}
