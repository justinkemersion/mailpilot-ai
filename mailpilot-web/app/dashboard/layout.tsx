import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell userLabel={user.email ?? user.name ?? user.id}>
      {children}
    </AppShell>
  );
}
