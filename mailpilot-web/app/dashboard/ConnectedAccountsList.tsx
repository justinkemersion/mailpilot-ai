"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useState } from "react";

export interface ConnectedAccountItem {
  id: number;
  email: string;
  display_name: string | null;
  active: boolean;
}

async function setAccountProcessingEnabled(
  accountId: number,
  enabled: boolean
): Promise<void> {
  void accountId;
  void enabled;
}

async function disconnectAccount(accountId: number): Promise<void> {
  void accountId;
}

export function ConnectedAccountsList({
  accounts: initialAccounts,
}: {
  accounts: ConnectedAccountItem[];
}) {
  const [processingById, setProcessingById] = useState<Record<number, boolean>>(
    () =>
      Object.fromEntries(initialAccounts.map((a) => [a.id, true])) as Record<
        number,
        boolean
      >
  );

  const toggleProcessing = useCallback(async (accountId: number, next: boolean) => {
    setProcessingById((prev) => ({ ...prev, [accountId]: next }));
    await setAccountProcessingEnabled(accountId, next);
  }, []);

  const onDisconnect = useCallback(async (accountId: number) => {
    await disconnectAccount(accountId);
  }, []);

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {initialAccounts.map((account) => {
        const enabled = processingById[account.id] ?? true;
        const title = account.email;
        const primary =
          account.display_name?.trim() || account.email.split("@")[0] || account.email;

        return (
          <li
            key={account.id}
            className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50"
                title={title}
              >
                {primary}
              </p>
              {account.display_name ? (
                <p
                  className="truncate text-xs text-zinc-500 dark:text-zinc-400"
                  title={title}
                >
                  {account.email}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="sr-only" id={`proc-label-${account.id}`}>
                Background processing for {account.email}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-labelledby={`proc-label-${account.id}`}
                onClick={() => void toggleProcessing(account.id, !enabled)}
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                  enabled
                    ? "bg-indigo-600 dark:bg-indigo-500"
                    : "bg-zinc-300 dark:bg-zinc-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    enabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>

              <button
                type="button"
                onClick={() => void onDisconnect(account.id)}
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                aria-label={`Disconnect ${account.email}`}
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
