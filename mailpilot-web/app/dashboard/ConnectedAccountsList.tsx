"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface ConnectedAccountItem {
  id: number;
  email: string;
  display_name: string | null;
  active: boolean;
  processing_enabled: boolean;
}

export function ConnectedAccountsList({
  accounts: initialAccounts,
}: {
  accounts: ConnectedAccountItem[];
}) {
  const router = useRouter();
  const [processingById, setProcessingById] = useState<Record<number, boolean>>(
    () =>
      Object.fromEntries(
        initialAccounts.map((a) => [a.id, a.processing_enabled])
      ) as Record<number, boolean>
  );
  const [patchingId, setPatchingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const accountsSyncKey = useMemo(
    () =>
      initialAccounts.map((a) => `${a.id}:${a.processing_enabled ? 1 : 0}`).join("|"),
    [initialAccounts]
  );

  useEffect(() => {
    setProcessingById(
      Object.fromEntries(
        initialAccounts.map((a) => [a.id, a.processing_enabled])
      ) as Record<number, boolean>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when server data identity (ids+flags) changes
  }, [accountsSyncKey]);

  const toggleProcessing = useCallback(async (accountId: number, next: boolean) => {
    setActionError(null);
    setProcessingById((p) => ({ ...p, [accountId]: next }));
    setPatchingId(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processing_enabled: next }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof payload?.error === "string" ? payload.error : `HTTP ${res.status}`
        );
      }
      if (
        payload?.account &&
        typeof payload.account.processing_enabled === "boolean"
      ) {
        setProcessingById((p) => ({
          ...p,
          [accountId]: payload.account.processing_enabled,
        }));
      }
      router.refresh();
    } catch (e) {
      console.error("Failed to update processing toggle:", e);
      setProcessingById((p) => ({ ...p, [accountId]: !next }));
      setActionError(
        e instanceof Error ? e.message : "Could not update processing setting."
      );
    } finally {
      setPatchingId(null);
    }
  }, [router]);

  const onDisconnect = useCallback(
    async (accountId: number) => {
      setActionError(null);
      setDeletingId(accountId);
      try {
        const res = await fetch(`/api/accounts/${accountId}`, {
          method: "DELETE",
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof payload?.error === "string" ? payload.error : `HTTP ${res.status}`
          );
        }
        router.refresh();
      } catch (e) {
        console.error("Failed to disconnect account:", e);
        setActionError(
          e instanceof Error ? e.message : "Could not disconnect account."
        );
      } finally {
        setDeletingId(null);
      }
    },
    [router]
  );

  return (
    <div className="space-y-3">
      {actionError ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {initialAccounts.map((account) => {
          const enabled = processingById[account.id] ?? true;
          const title = account.email;
          const primary =
            account.display_name?.trim() ||
            account.email.split("@")[0] ||
            account.email;
          const isPatching = patchingId === account.id;
          const isDeleting = deletingId === account.id;
          const controlsDisabled = isPatching || isDeleting;

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
                  aria-busy={isPatching}
                  aria-labelledby={`proc-label-${account.id}`}
                  disabled={controlsDisabled}
                  onClick={() => void toggleProcessing(account.id, !enabled)}
                  className={`relative h-6 w-10 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${
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
                  disabled={controlsDisabled}
                  onClick={() => void onDisconnect(account.id)}
                  className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                  aria-label={`Disconnect ${account.email}`}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
