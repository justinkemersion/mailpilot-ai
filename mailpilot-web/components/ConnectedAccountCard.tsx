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
  const title = account.email;
  const primary =
    account.display_name?.trim() || account.email.split("@")[0] || account.email;
  const controlsDisabled = isPatching || isDeleting;

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4",
        "dark:border-zinc-800 dark:bg-zinc-900"
      )}
    >
      <div className="flex items-start gap-3">
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
            title={title}
          >
            {primary}
          </p>
          <p
            className="truncate text-xs text-zinc-500 dark:text-zinc-400"
            title={title}
          >
            {account.email}
          </p>
          <div className="mt-2">
            <StatusBadge status={processingEnabled ? "enabled" : "disabled"} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
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
        <div className="flex shrink-0 items-center gap-2">
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
              "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-red-400",
              focusRing
            )}
            aria-label={`Disconnect ${account.email}`}
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </li>
  );
}
