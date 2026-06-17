"use client";

import { AlertBanner } from "@/components/ui/AlertBanner";
import { CategoryPill } from "@/components/ui/CategoryPill";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CleanupAction, CleanupGroup } from "@/lib/cleanup";
import { countCleanupCandidates } from "@/lib/cleanup";
import { accountAvatarClass, accountInitial } from "@/lib/accountAvatar";
import { parseSender, truncateText } from "@/lib/emailActivity";
import { formatMailpilotDateUtc } from "@/lib/formatMailpilotDate";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Archive, Check, Inbox, Loader2, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface CleanupQueueProps {
  initialGroups: CleanupGroup[];
}

type RequestState = "idle" | "pending";

export function CleanupQueue({ initialGroups }: CleanupQueueProps) {
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const total = useMemo(() => countCleanupCandidates(groups), [groups]);
  const selectedIds = useMemo(() => [...selected], [selected]);
  const selectedCount = selectedIds.length;

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(group: CleanupGroup) {
    const ids = group.candidates.map((candidate) => candidate.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function runAction(action: CleanupAction) {
    if (selectedIds.length === 0 || requestState === "pending") return;
    setRequestState("pending");
    setMessage(null);

    try {
      const res = await fetch("/api/cleanup/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          processed_email_ids: selectedIds,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        demo?: boolean;
        processed?: number[];
        failed?: Array<{ id: number; error: string }>;
      };
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const resolvedIds = body.demo ? selectedIds : body.processed ?? [];
      setGroups((prev) =>
        prev.map((group) => ({
          ...group,
          candidates: group.candidates.filter(
            (candidate) => !resolvedIds.includes(candidate.id)
          ),
        }))
      );
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of resolvedIds) next.delete(id);
        return next;
      });

      const failed = body.failed?.length ?? 0;
      setMessage({
        type: failed > 0 ? "error" : "success",
        text:
          failed > 0
            ? `${resolvedIds.length} resolved; ${failed} failed.`
            : body.demo
              ? body.message ?? "Demo action simulated."
              : `${resolvedIds.length} message${resolvedIds.length === 1 ? "" : "s"} resolved.`,
      });
      router.refresh();
    } catch (err) {
      console.error("Cleanup action failed:", err);
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Cleanup action failed.",
      });
    } finally {
      setRequestState("idle");
    }
  }

  if (total === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Your inbox is caught up"
        description="New unresolved labeled mail will appear here after the next sync."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">
            {selectedCount > 0
              ? `${selectedCount} selected`
              : `${total} unresolved message${total === 1 ? "" : "s"}`}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            Archive removes mail from INBOX. Keep resolves it without changing Gmail labels.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runAction("archive")}
            disabled={selectedCount === 0 || requestState === "pending"}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50",
              focusRing
            )}
          >
            {requestState === "pending" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Archive className="h-4 w-4" aria-hidden />
            )}
            Archive
          </button>
          <button
            type="button"
            onClick={() => void runAction("keep")}
            disabled={selectedCount === 0 || requestState === "pending"}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-2 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50",
              focusRing
            )}
          >
            <Check className="h-4 w-4" aria-hidden />
            Keep
          </button>
        </div>
      </div>

      {message ? (
        <AlertBanner variant={message.type} layout="standalone">
          {message.text}
        </AlertBanner>
      ) : null}

      {groups.map((group) => (
        <CleanupGroupSection
          key={group.tier}
          group={group}
          selected={selected}
          disabled={requestState === "pending"}
          onToggleOne={toggleOne}
          onToggleGroup={toggleGroup}
        />
      ))}
    </div>
  );
}

function CleanupGroupSection({
  group,
  selected,
  disabled,
  onToggleOne,
  onToggleGroup,
}: {
  group: CleanupGroup;
  selected: Set<number>;
  disabled: boolean;
  onToggleOne: (id: number) => void;
  onToggleGroup: (group: CleanupGroup) => void;
}) {
  const count = group.candidates.length;
  const selectedInGroup = group.candidates.filter((candidate) =>
    selected.has(candidate.id)
  ).length;
  const allSelected = count > 0 && selectedInGroup === count;

  return (
    <section className="overflow-hidden rounded-xl border border-border-subtle bg-surface-1">
      <div className="flex flex-col gap-3 border-b border-border-subtle bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {group.tier === "never_auto" ? (
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            ) : null}
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {group.title}
            </h3>
            <span className="rounded-full bg-surface-1 px-2 py-0.5 text-xs tabular-nums text-text-muted">
              {count}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-muted">{group.description}</p>
        </div>
        <button
          type="button"
          onClick={() => onToggleGroup(group)}
          disabled={count === 0 || disabled}
          className={cn(
            "inline-flex min-h-11 items-center justify-center rounded-lg border border-border-subtle bg-surface-1 px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
            focusRing
          )}
        >
          {allSelected ? "Clear selection" : "Select group"}
        </button>
      </div>

      {count === 0 ? (
        <p className="px-4 py-6 text-sm text-text-muted">No messages in this group.</p>
      ) : (
        <div className="divide-y divide-border-subtle">
          {group.candidates.map((candidate) => (
            <CleanupRow
              key={candidate.id}
              candidate={candidate}
              selected={selected.has(candidate.id)}
              disabled={disabled}
              onToggle={() => onToggleOne(candidate.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CleanupRow({
  candidate,
  selected,
  disabled,
  onToggle,
}: {
  candidate: CleanupGroup["candidates"][number];
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const acctEmail = candidate.accounts?.email ?? "";
  const { displayName, address } = parseSender(candidate.sender);
  const senderLine = address && address !== displayName ? address : displayName;

  return (
    <label
      className={cn(
        "grid cursor-pointer grid-cols-[auto_1fr] gap-3 px-4 py-3 transition-colors hover:bg-surface-2/70 sm:grid-cols-[auto_auto_1fr_auto]",
        selected ? "bg-indigo-50/70 dark:bg-indigo-950/20" : ""
      )}
    >
      <span className="flex h-8 items-center">
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
          className="h-4 w-4 rounded border-border-subtle text-accent focus:ring-accent"
        />
      </span>
      <span
        className={cn(
          "hidden h-8 w-8 items-center justify-center rounded-full text-xs font-semibold sm:flex",
          accountAvatarClass(acctEmail)
        )}
        title={acctEmail || undefined}
      >
        {accountInitial(acctEmail)}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <CategoryPill category={candidate.category} />
          <span className="text-xs text-text-muted">{candidate.safety_label}</span>
        </span>
        <span
          className="mt-1 block truncate text-sm font-medium text-text-primary"
          title={candidate.subject ?? ""}
        >
          {candidate.subject ? truncateText(candidate.subject, 96) : "(no subject)"}
        </span>
        <span
          className="mt-0.5 block truncate text-xs text-text-muted"
          title={candidate.sender ?? ""}
        >
          {truncateText(senderLine, 72)}
        </span>
      </span>
      <time
        dateTime={candidate.message_received_at ?? candidate.processed_at}
        className="col-start-2 text-xs whitespace-nowrap text-text-muted sm:col-start-auto sm:self-center"
      >
        {formatMailpilotDateUtc(candidate.message_received_at ?? candidate.processed_at)}
      </time>
    </label>
  );
}
