"use client";

import { ConnectedAccountCard } from "@/components/ConnectedAccountCard";
import { AlertBanner } from "@/components/ui/AlertBanner";
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
  lastSyncedByAccount = {},
}: {
  accounts: ConnectedAccountItem[];
  lastSyncedByAccount?: Record<number, string>;
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
        <AlertBanner variant="error">{actionError}</AlertBanner>
      ) : null}

      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {initialAccounts.map((account) => (
          <ConnectedAccountCard
            key={account.id}
            account={account}
            processingEnabled={processingById[account.id] ?? true}
            lastSyncedAt={lastSyncedByAccount[account.id] ?? null}
            isPatching={patchingId === account.id}
            isDeleting={deletingId === account.id}
            onToggle={(next) => void toggleProcessing(account.id, next)}
            onDisconnect={() => void onDisconnect(account.id)}
          />
        ))}
      </ul>
    </div>
  );
}
