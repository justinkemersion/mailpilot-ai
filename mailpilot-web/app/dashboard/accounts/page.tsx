import { getCurrentUser } from "@/lib/auth/session";
import { getConnectedAccounts } from "@/lib/dashboard/queries";
import { redirect } from "next/navigation";
import { ConnectGmailLink } from "../ConnectGmailLink";
import { ConnectedAccountsList } from "../ConnectedAccountsList";
import { DashboardShell } from "../DashboardShell";

export default async function AccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const accounts = await getConnectedAccounts(user.id);

  return (
    <DashboardShell userLabel={user.email ?? user.name ?? user.id}>
      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Connected Gmail accounts
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              MailPilot processes mail in the background for each connected account.
            </p>
          </div>
          <ConnectGmailLink />
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No Gmail accounts connected yet.
            </p>
            <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
              Tap &ldquo;Connect Gmail&rdquo; to get started.
            </p>
          </div>
        ) : (
          <ConnectedAccountsList accounts={accounts} />
        )}
      </section>
    </DashboardShell>
  );
}
