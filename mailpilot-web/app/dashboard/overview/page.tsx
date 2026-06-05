import { AlertBanner } from "@/components/ui/AlertBanner";
import { ClassifierStatusCard } from "@/components/ClassifierStatusCard";
import { OverviewAccountsSnapshot } from "@/components/OverviewAccountsSnapshot";
import { OverviewMetricsGrid } from "@/components/OverviewMetricsGrid";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getConnectedAccounts,
  getDashboardMetrics,
  getEmailHistoryPreview,
  getLastSyncedByAccount,
  getLatestJob,
} from "@/lib/dashboard/queries";
import { OVERVIEW_ACTIVITY_PREVIEW_LIMIT } from "@/lib/emailActivity";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HistoryTable } from "../HistoryTable";
import { RunSyncControl } from "../RunSyncControl";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [accounts, historyPreview, latestJob, metrics, lastSyncedByAccount] =
    await Promise.all([
      getConnectedAccounts(user.id),
      getEmailHistoryPreview(user.id),
      getLatestJob(user.id),
      getDashboardMetrics(user.id),
      getLastSyncedByAccount(user.id),
    ]);

  const params = await searchParams;
  const justConnected = params.connected === "true";
  const connectError = params.error;
  const previewCount = historyPreview.length;

  return (
    <div className="space-y-8 sm:space-y-10">
      {justConnected ? (
        <AlertBanner variant="success">
          Gmail account connected successfully.
        </AlertBanner>
      ) : null}
      {connectError ? (
        <AlertBanner variant="error">
          Something went wrong connecting Gmail ({connectError}). Please try again.
        </AlertBanner>
      ) : null}

      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Your inbox at a glance
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Real-time metrics and recent mail processing across connected Gmail accounts.
        </p>
      </header>

      <OverviewMetricsGrid metrics={metrics} />

      <section className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <ClassifierStatusCard job={latestJob} />
        <RunSyncControl initialJob={latestJob} variant="section" />
      </section>

      <OverviewAccountsSnapshot
        accounts={accounts}
        lastSyncedByAccount={lastSyncedByAccount}
      />

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              id="recent-activity-heading"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Recent activity
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              {previewCount > 0
                ? `Showing ${previewCount.toLocaleString()} most recent processed email${previewCount === 1 ? "" : "s"}.`
                : `Up to ${OVERVIEW_ACTIVITY_PREVIEW_LIMIT} most recent processed emails will appear here after your first sync.`}
            </p>
          </div>
          <Link
            href="/dashboard/activity"
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-4 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-950",
              focusRing
            )}
          >
            View all activity
          </Link>
        </div>
        <HistoryTable rows={historyPreview} />
      </section>
    </div>
  );
}
