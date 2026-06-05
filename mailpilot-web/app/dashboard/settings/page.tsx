import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { DashboardShell } from "../DashboardShell";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <DashboardShell userLabel={user.email ?? user.name ?? user.id}>
      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Settings
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Account and automation preferences will appear here.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Settings are not available yet.
          </p>
        </div>
      </section>
    </DashboardShell>
  );
}
