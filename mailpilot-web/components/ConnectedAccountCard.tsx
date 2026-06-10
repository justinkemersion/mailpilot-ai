"use client";

import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ConnectedAccountItem } from "@/app/dashboard/ConnectedAccountsList";
import { accountAvatarClass, accountInitial } from "@/lib/accountAvatar";
import { formatMailpilotDateUtc } from "@/lib/formatMailpilotDate";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

interface ConnectedAccountCardProps {
  account: ConnectedAccountItem;
  processingEnabled: boolean;
  lastSyncedAt: string | null;
  isPatching: boolean;
  isDeleting: boolean;
  onToggle: (enabled: boolean) => void;
  onDisconnect: () => void;
}

export function ConnectedAccountCard({
  account,
  processingEnabled,
  lastSyncedAt,
  isPatching,
  isDeleting,
  onToggle,
  onDisconnect,
}: ConnectedAccountCardProps) {
  const controlsDisabled = isPatching || isDeleting;
  const title = account.email;
  const displayName = account.display_name?.trim();
  const showDisplayName =
    displayName != null &&
    displayName.length > 0 &&
    displayName.toLowerCase() !== account.email.split("@")[0]?.toLowerCase();

  return (
    <li
      className={cn(
        "rounded-xl border border-border-subtle bg-surface-1 p-4"
      )}
    >
      <div className="flex gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            accountAvatarClass(account.email)
          )}
          aria-hidden
        >
          {accountInitial(account.email)}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-semibold text-text-primary"
                title={title}
              >
                {account.email}
              </p>
              {showDisplayName ? (
                <p
                  className="mt-0.5 truncate text-xs text-text-muted"
                  title={displayName}
                >
                  {displayName}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <span className="sr-only" id={`proc-label-${account.id}`}>
                Background processing for {account.email}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={processingEnabled}
                aria-busy={isPatching}
                aria-labelledby={`proc-label-${account.id}`}
                disabled={controlsDisabled}
                onClick={() => onToggle(!processingEnabled)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!controlsDisabled) onToggle(!processingEnabled);
                  }
                }}
                className={cn(
                  "relative h-6 w-10 shrink-0 rounded-full transition-colors",
                  focusRing,
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  processingEnabled
                    ? "bg-indigo-600 dark:bg-indigo-500"
                    : "bg-zinc-300 dark:bg-zinc-600"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                    processingEnabled ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
              <button
                type="button"
                disabled={controlsDisabled}
                onClick={onDisconnect}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40",
                  focusRing
                )}
                aria-label={`Disconnect ${account.email}`}
              >
                <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                <span className="hidden sm:inline">Disconnect</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <StatusBadge status={processingEnabled ? "enabled" : "disabled"} />
            <p className="text-xs text-text-muted">
              {lastSyncedAt ? (
                <>
                  Last activity{" "}
                  <span className="font-medium text-text-secondary">
                    {formatMailpilotDateUtc(lastSyncedAt)}
                  </span>
                </>
              ) : (
                "No processed mail yet"
              )}
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}
