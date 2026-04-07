import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import { HistoryTable, type ProcessedEmailRow } from "./HistoryTable";
import { RunPanel } from "./RunPanel";
import type { RunJobRow } from "@/app/api/run/route";

interface ConnectedAccount {
  id: number;
  email: string;
  display_name: string | null;
  active: boolean;
}

async function getConnectedAccounts(userId: string): Promise<ConnectedAccount[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("accounts")
    .select("id, email, display_name, active")
    .eq("user_id", userId)
    .eq("active", true)
    .order("email");
  return (data as ConnectedAccount[]) ?? [];
}

async function getEmailHistory(userId: string): Promise<ProcessedEmailRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("processed_emails")
    .select(
      "id, gmail_message_id, account_id, accounts(email), category, subject, sender, processed_at, message_received_at, actions_taken, was_archived, applied_label_names"
    )
    .eq("user_id", userId)
    // Newest in mailbox first when message_received_at is set (Gmail internalDate).
    .order("message_received_at", { ascending: false, nullsFirst: false })
    .order("processed_at", { ascending: false })
    // Gmail list is newest-first; we insert in that order, so lower id = newer within the same second.
    .order("id", { ascending: true })
    .limit(50);
  return (data as unknown as ProcessedEmailRow[]) ?? [];
}

async function getLatestJob(userId: string): Promise<RunJobRow | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("run_jobs")
    .select("id, status, options, result, error, created_at, started_at, completed_at")
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
        className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
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
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            MailPilot
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
        {/* Flash messages */}
        {justConnected && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 dark:bg-green-950 dark:border-green-800 dark:text-green-400">
            Gmail account connected successfully.
          </div>
        )}
        {connectError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 dark:bg-red-950 dark:border-red-800 dark:text-red-400">
            Something went wrong connecting Gmail ({connectError}). Please try
            again.
          </div>
        )}

        {/* Connected accounts */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Connected Gmail accounts
              </h2>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                MailPilot will process emails for each connected account.
              </p>
            </div>
            <a
              href="/auth/google"
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
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

          {accounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No Gmail accounts connected yet.
              </p>
              <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
                Click &ldquo;Connect Gmail&rdquo; to get started.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {account.email[0].toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {account.display_name ?? account.email}
                      </p>
                      {account.display_name && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {account.email}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    Active
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Run panel */}
        <RunPanel initialJob={latestJob} />

        {/* Email history */}
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
