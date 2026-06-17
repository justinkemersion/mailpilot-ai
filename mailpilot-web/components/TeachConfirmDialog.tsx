"use client";

import type { ProcessedEmailRow } from "@/lib/emailActivity";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface TeachPreviewData {
  match_count: number;
  scanned_count: number;
  scan_limit: number;
  truncated: boolean;
  total_candidate_count?: number;
  includes_source: boolean;
  account_email: string | null;
  summary: string;
  confirm_body: string;
}

interface TeachConfirmDialogProps {
  open: boolean;
  row: ProcessedEmailRow | null;
  actionPolicy: "archive" | "never_archive" | null;
  preview: TeachPreviewData | null;
  loading: boolean;
  confirming: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function TeachConfirmDialog({
  open,
  row,
  actionPolicy,
  preview,
  loading,
  confirming,
  error,
  onCancel,
  onConfirm,
}: TeachConfirmDialogProps) {
  if (!open || !row || !actionPolicy) return null;

  const mailbox = preview?.account_email ?? row.accounts?.email ?? "this mailbox";
  const policyLabel =
    actionPolicy === "never_archive"
      ? "Never auto-archive similar"
      : "Always archive similar";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !confirming) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="teach-confirm-title"
        className="w-full max-w-md rounded-xl border border-border-subtle bg-surface-1 p-5 shadow-xl"
      >
        <h3
          id="teach-confirm-title"
          className="text-base font-semibold text-text-primary"
        >
          {policyLabel}
        </h3>
        <p className="mt-1 text-sm text-text-muted">Mailbox: {mailbox}</p>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Checking similar messages…
          </div>
        ) : preview ? (
          <div className="mt-4 space-y-2 text-sm text-text-primary">
            <p>{preview.confirm_body}</p>
            {preview.truncated && preview.total_candidate_count != null ? (
              <p className="text-text-muted">
                This mailbox has {preview.total_candidate_count.toLocaleString()} messages
                in scope for this rule.
              </p>
            ) : null}
            <p className="text-text-muted">
              MailPilot will update its records only. Gmail is not changed by teach.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className={cn(
              "inline-flex min-h-10 items-center justify-center rounded-lg border border-border-subtle px-4 text-sm font-medium text-text-primary hover:bg-surface-2 disabled:opacity-50",
              focusRing
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || confirming || !preview}
            className={cn(
              "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50",
              focusRing
            )}
          >
            {confirming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Confirm teach rule"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
