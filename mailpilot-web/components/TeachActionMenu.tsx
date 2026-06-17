"use client";

import type { ProcessedEmailRow } from "@/lib/emailActivity";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { GraduationCap, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type TeachButtonState = "idle" | "pending" | "done" | "error";

interface TeachActionMenuProps {
  row: ProcessedEmailRow;
  state: TeachButtonState;
  onTeach: (
    row: ProcessedEmailRow,
    actionPolicy: "archive" | "never_archive"
  ) => void;
  size?: "default" | "compact";
}

export function TeachActionMenu({
  row,
  state,
  onTeach,
  size = "default",
}: TeachActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const acctEmail = row.accounts?.email ?? "this mailbox";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const compact = size === "compact";

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={state === "pending"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Teach MailPilot from this message"
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800",
          compact ? "h-9 w-9" : "min-h-11 min-w-11",
          focusRing
        )}
      >
        {state === "pending" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <GraduationCap className="h-4 w-4" aria-hidden />
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-border-subtle bg-surface-1 py-1 shadow-lg"
        >
          <p className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Teach for {acctEmail}
          </p>
          <button
            type="button"
            role="menuitem"
            className={cn(
              "block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-2",
              focusRing
            )}
            onClick={() => {
              setOpen(false);
              onTeach(row, "archive");
            }}
          >
            Always archive similar
          </button>
          <button
            type="button"
            role="menuitem"
            className={cn(
              "block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-2",
              focusRing
            )}
            onClick={() => {
              setOpen(false);
              onTeach(row, "never_archive");
            }}
          >
            Never auto-archive similar
          </button>
        </div>
      ) : null}

      {state === "done" ? (
        <span className="sr-only">Rule saved</span>
      ) : null}
      {state === "error" ? (
        <span className="absolute -bottom-5 right-0 text-[10px] text-red-500">Failed</span>
      ) : null}
    </div>
  );
}
