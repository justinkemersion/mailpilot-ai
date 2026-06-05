import { getCurrentUser } from "@/lib/auth/session";
import { getEmailHistory } from "@/lib/dashboard/queries";
import { redirect } from "next/navigation";
import { DashboardShell } from "../DashboardShell";
import { HistoryTable } from "../HistoryTable";

export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const history = await getEmailHistory(user.id);

  return (
    <DashboardShell userLabel={user.email ?? user.name ?? user.id}>
      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Email history
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Last 50 emails processed by MailPilot across all connected accounts.
          </p>
        </div>
        <HistoryTable rows={history} />
      </section>
    </DashboardShell>
  );
}
