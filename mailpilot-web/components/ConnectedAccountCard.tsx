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
        "rounded-xl border border-border-subtle bg-surface-1 p-4"
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
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
              className="truncate text-sm font-semibold text-text-primary"
              title={title}
            >
              {primary}
            </p>
            <p
              className="truncate text-xs text-text-muted"
              title={title}
            >
              {account.email}
            </p>
            <div className="mt-1.5 sm:hidden">
              <StatusBadge status={processingEnabled ? "enabled" : "disabled"} />
            </div>
          </div>
        </div>

        <div className="hidden shrink-0 sm:block">
          <StatusBadge status={processingEnabled ? "enabled" : "disabled"} />
        </div>

        <p className="shrink-0 text-xs text-text-muted sm:min-w-[8.5rem] sm:text-right">
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
    </li>
  );
}
