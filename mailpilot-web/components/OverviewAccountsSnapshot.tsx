import { ConnectGmailLink } from "@/app/dashboard/ConnectGmailLink";
import { AccountsEmptyState } from "@/components/AccountsEmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { accountAvatarClass, accountInitial } from "@/lib/accountAvatar";
import type { ConnectedAccount } from "@/lib/dashboard/queries";
import { formatMailpilotDateUtc } from "@/lib/formatMailpilotDate";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface OverviewAccountsSnapshotProps {
  accounts: ConnectedAccount[];
  lastSyncedByAccount: Record<number, string>;
}

function CompactAccountCard({
  account,
  lastSyncedAt,
}: {
  account: ConnectedAccount;
  lastSyncedAt: string | null;
}) {
  const displayName = account.display_name?.trim();
  const showDisplayName =
    displayName != null &&
    displayName.length > 0 &&
    displayName.toLowerCase() !== account.email.split("@")[0]?.toLowerCase();

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-1 p-4 sm:flex-row sm:items-center sm:gap-4"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            accountAvatarClass(account.email)
          )}
          aria-hidden
        >
          {accountInitial(account.email)}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            title={account.email}
          >
            {account.email}
          </p>
          {showDisplayName ? (
            <p
              className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400"
              title={displayName}
            >
              {displayName}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end">
        <StatusBadge
          status={account.processing_enabled ? "enabled" : "disabled"}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {lastSyncedAt ? (
            <>
              Last activity{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {formatMailpilotDateUtc(lastSyncedAt)}
              </span>
            </>
          ) : (
            "No processed mail yet"
          )}
        </p>
      </div>
    </div>
  );
}

function AccountsSummaryCard({
  total,
  active,
}: {
  total: number;
  active: number;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border-subtle bg-surface-1 p-5 sm:flex-row sm:items-center sm:justify-between"
      )}
    >
      <div>
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {total.toLocaleString()} account{total === 1 ? "" : "s"} connected
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {active.toLocaleString()} active for background processing
          {active < total
            ? ` · ${(total - active).toLocaleString()} paused`
            : ""}
        </p>
      </div>
      <Link
        href="/dashboard/accounts"
        className={cn(
          "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-100 dark:hover:bg-zinc-800",
          focusRing
        )}
      >
        Manage accounts
      </Link>
    </div>
  );
}

export function OverviewAccountsSnapshot({
  accounts,
  lastSyncedByAccount,
}: OverviewAccountsSnapshotProps) {
  const activeCount = accounts.filter((a) => a.processing_enabled).length;

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Connected accounts
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {accounts.length === 0
              ? "Connect Gmail to start automatic sorting and labeling."
              : accounts.length <= 2
                ? "MailPilot processes mail in the background for each account."
                : "View and manage all connected inboxes on the Accounts page."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {accounts.length > 0 ? (
            <Link
              href="/dashboard/accounts"
              className={cn(
                "inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300",
                focusRing
              )}
            >
              Manage accounts
            </Link>
          ) : null}
          {accounts.length <= 2 ? <ConnectGmailLink /> : null}
        </div>
      </div>

      {accounts.length === 0 ? (
        <AccountsEmptyState />
      ) : accounts.length <= 2 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {accounts.map((account) => (
            <li key={account.id}>
              <CompactAccountCard
                account={account}
                lastSyncedAt={lastSyncedByAccount[account.id] ?? null}
              />
            </li>
          ))}
        </ul>
      ) : (
        <AccountsSummaryCard total={accounts.length} active={activeCount} />
      )}
    </section>
  );
}
