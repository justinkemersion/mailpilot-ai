"use client";

import { ConnectedAccountCard } from "@/components/ConnectedAccountCard";
import { AlertBanner } from "@/components/ui/AlertBanner";
import type { AccountPurpose, DefaultArchivePolicy, SecurityPosture } from "@/lib/accountScope";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface ConnectedAccountItem {
  id: number;
  email: string;
  display_name: string | null;
  active: boolean;
  processing_enabled: boolean;
  purpose: AccountPurpose;
  default_archive_policy: DefaultArchivePolicy;
  security_posture: SecurityPosture;
  scope_configured_at: string | null;
}

export function ConnectedAccountsList({
  accounts: initialAccounts,
  lastSyncedByAccount = {},
}: {
  accounts: ConnectedAccountItem[];
  lastSyncedByAccount?: Record<number, string>;
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [processingById, setProcessingById] = useState<Record<number, boolean>>(
    () =>
      Object.fromEntries(
        initialAccounts.map((a) => [a.id, a.processing_enabled])
      ) as Record<number, boolean>
  );
  const [patchingId, setPatchingId] = useState<number | null>(null);
  const [scopePatchingId, setScopePatchingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const accountsSyncKey = useMemo(
    () =>
      initialAccounts
        .map(
          (a) =>
            `${a.id}:${a.processing_enabled ? 1 : 0}:${a.purpose}:${a.scope_configured_at ?? ""}`
        )
        .join("|"),
    [initialAccounts]
  );

  useEffect(() => {
    setAccounts(initialAccounts);
    setProcessingById(
      Object.fromEntries(
        initialAccounts.map((a) => [a.id, a.processing_enabled])
      ) as Record<number, boolean>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when server data identity changes
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

  const updatePurpose = useCallback(
    async (accountId: number, purpose: AccountPurpose) => {
      setActionError(null);
      const prev = accounts.find((a) => a.id === accountId);
      if (!prev || prev.purpose === purpose) return;

      setScopePatchingId(accountId);
      try {
        const res = await fetch(`/api/accounts/${accountId}/scope`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purpose }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof payload?.error === "string" ? payload.error : `HTTP ${res.status}`
          );
        }
        if (payload?.account) {
          setAccounts((list) =>
            list.map((a) =>
              a.id === accountId
                ? {
                    ...a,
                    purpose: payload.account.purpose,
                    default_archive_policy: payload.account.default_archive_policy,
                    security_posture: payload.account.security_posture,
                    scope_configured_at: payload.account.scope_configured_at,
                  }
                : a
            )
          );
        }
        router.refresh();
      } catch (e) {
        console.error("Failed to update mailbox scope:", e);
        setActionError(
          e instanceof Error ? e.message : "Could not update mailbox type."
        );
      } finally {
        setScopePatchingId(null);
      }
    },
    [accounts, router]
  );

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

  const unconfiguredCount = accounts.filter((a) => a.scope_configured_at == null).length;

  return (
    <div className="space-y-3">
      {unconfiguredCount > 0 ? (
        <AlertBanner variant="info">
          {unconfiguredCount === 1
            ? "One connected inbox has not been categorized yet. Choose a mailbox type so MailPilot can scope rules correctly."
            : `${unconfiguredCount} connected inboxes have not been categorized yet. Choose a mailbox type for each.`}
        </AlertBanner>
      ) : null}

      {actionError ? (
        <AlertBanner variant="error">{actionError}</AlertBanner>
      ) : null}

      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {accounts.map((account) => (
          <ConnectedAccountCard
            key={account.id}
            account={account}
            processingEnabled={processingById[account.id] ?? true}
            lastSyncedAt={lastSyncedByAccount[account.id] ?? null}
            isPatching={patchingId === account.id}
            isScopePatching={scopePatchingId === account.id}
            isDeleting={deletingId === account.id}
            onToggle={(next) => void toggleProcessing(account.id, next)}
            onPurposeChange={(purpose) => void updatePurpose(account.id, purpose)}
            onDisconnect={() => void onDisconnect(account.id)}
          />
        ))}
      </ul>
    </div>
  );
}
