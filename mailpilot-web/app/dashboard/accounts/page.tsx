import { getCurrentUser } from "@/lib/auth/session";
import {
  getConnectedAccounts,
  getLastSyncedByAccount,
} from "@/lib/dashboard/queries";
import { isDemoUser } from "@/lib/demo";
import { redirect } from "next/navigation";
import { AccountsEmptyState } from "@/components/AccountsEmptyState";
import { DemoConnectNotice } from "@/components/DemoOverviewCard";
import { ConnectGmailLink } from "../ConnectGmailLink";
import { ConnectedAccountsList } from "../ConnectedAccountsList";

export default async function AccountsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const demo = isDemoUser(user);

  const [accounts, lastSyncedByAccount] = await Promise.all([
    getConnectedAccounts(user.id),
    getLastSyncedByAccount(user.id),
  ]);

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Connected Gmail accounts
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {demo
              ? "Sample connected accounts shown for demo purposes."
              : "MailPilot processes mail in the background for each connected account."}
          </p>
        </div>
        {demo ? null : <ConnectGmailLink />}
      </div>

      {demo ? <DemoConnectNotice className="mb-4" /> : null}

      {accounts.length === 0 ? (
        <AccountsEmptyState />
      ) : (
        <ConnectedAccountsList
          accounts={accounts}
          lastSyncedByAccount={lastSyncedByAccount}
        />
      )}
    </section>
  );
}
