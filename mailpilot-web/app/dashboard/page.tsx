import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import { ConnectedAccountsList } from "./ConnectedAccountsList";
import { HistoryTable, type ProcessedEmailRow } from "./HistoryTable";
import { RunSyncControl } from "./RunSyncControl";
import type { RunJobRow } from "@/app/api/run/route";

interface ConnectedAccount {
  id: number;
  email: string;
  display_name: string | null;
  active: boolean;
  processing_enabled: boolean;
}

async function getConnectedAccounts(userId: string): Promise<ConnectedAccount[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("accounts")
    .select("id, email, display_name, active, processing_enabled")
    .eq("user_id", userId)
    .eq("active", true)
    .order("email");
  const rows = (data as ConnectedAccount[] | null) ?? [];
  return rows.map((row) => ({
    ...row,
    processing_enabled: row.processing_enabled !== false,
  }));
}

async function getEmailHistory(userId: string): Promise<ProcessedEmailRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("processed_emails")
    .select(
      "id, gmail_message_id, account_id, accounts(email), category, subject, sender, processed_at, message_received_at, actions_taken, was_archived, applied_label_names"
    )
    .eq("user_id", userId)
    .order("message_received_at", { ascending: false, nullsFirst: false })
    .order("processed_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(50);
  return (data as unknown as ProcessedEmailRow[]) ?? [];
}

async function getLatestJob(userId: string): Promise<RunJobRow | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("run_jobs")
    .select(
      "id, status, options, result, error, progress, created_at, started_at, completed_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as RunJobRow | null) ?? null;
}

async function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="min-h-11 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 sm:w-auto sm:border-0 sm:px-2 sm:py-1"
      >
        Sign out
      </button>
    </form>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [accounts, history, latestJob] = await Promise.all([
    getConnectedAccounts(user.id),
    getEmailHistory(user.id),
    getLatestJob(user.id),
  ]);

  const params = await searchParams;
  const justConnected = params.connected === "true";
  const connectError = params.error;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <h1 className="shrink-0 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              MailPilot
            </h1>
            <div className="flex min-w-0 flex-col gap-2 border-t border-zinc-200 pt-3 sm:shrink-0 sm:flex-row sm:items-center sm:gap-4 sm:border-0 sm:pt-0">
              <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                {user.email}
              </span>
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
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
            <a
              href="/auth/google"
              className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 sm:w-auto dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
                />
                <path
                  fill="currentColor"
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
                />
                <path
                  fill="currentColor"
                  d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
                />
                <path
                  fill="currentColor"
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
                />
              </svg>
              Connect Gmail
            </a>
          </div>

          <div className="mb-6">
            <RunSyncControl initialJob={latestJob} variant="section" />
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
      </main>
    </div>
  );
}
