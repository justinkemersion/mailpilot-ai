import { ClassifierStatusCard } from "@/components/ClassifierStatusCard";
import { OverviewMetricsGrid } from "@/components/OverviewMetricsGrid";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getConnectedAccounts,
  getDashboardMetrics,
  getEmailHistory,
  getLastSyncedByAccount,
  getLatestJob,
} from "@/lib/dashboard/queries";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConnectGmailLink } from "../ConnectGmailLink";
import { ConnectedAccountsList } from "../ConnectedAccountsList";
import { HistoryTable } from "../HistoryTable";
import { RunSyncControl } from "../RunSyncControl";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [accounts, history, latestJob, metrics, lastSyncedByAccount] =
    await Promise.all([
      getConnectedAccounts(user.id),
      getEmailHistory(user.id),
      getLatestJob(user.id),
      getDashboardMetrics(user.id),
      getLastSyncedByAccount(user.id),
    ]);

  const params = await searchParams;
  const justConnected = params.connected === "true";
  const connectError = params.error;

  return (
    <>
      {justConnected && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
          Gmail account connected successfully.
        </div>
      )}
      {connectError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          Something went wrong connecting Gmail ({connectError}). Please try again.
        </div>
      )}

      <OverviewMetricsGrid metrics={metrics} />

      <section className="grid gap-4 lg:grid-cols-2">
        <ClassifierStatusCard job={latestJob} />
        <RunSyncControl initialJob={latestJob} variant="section" />
      </section>

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
          <ConnectedAccountsList
            accounts={accounts}
            lastSyncedByAccount={lastSyncedByAccount}
          />
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Recent activity
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              Last 50 emails processed across all connected accounts.
            </p>
          </div>
          <Link
            href="/dashboard/activity"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            View all activity →
          </Link>
        </div>
        <HistoryTable
          rows={history}
          categoryCounts={metrics.by_category}
          totalCount={metrics.total_processed}
        />
      </section>
    </>
  );
}
