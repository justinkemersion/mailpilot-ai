"use client";

import {
  canUndo,
  isUndone,
  type ProcessedEmailRow,
} from "@/lib/emailActivity";
import { Loader2, Undo2 } from "lucide-react";

export type UndoButtonState = "idle" | "pending" | "done" | "error";

interface UndoActionButtonProps {
  row: ProcessedEmailRow;
  state: UndoButtonState;
  onUndo: (row: ProcessedEmailRow) => void;
}

export function UndoActionButton({ row, state, onUndo }: UndoActionButtonProps) {
  const undone = isUndone(row.actions_taken);
  const undoable = canUndo(row);

  if (undoable && !undone) {
    return (
      <button
        type="button"
        onClick={() => onUndo(row)}
        disabled={state === "pending"}
        aria-label="Undo Gmail changes for this message"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {state === "pending" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Undo2 className="h-4 w-4" aria-hidden />
        )}
      </button>
    );
  }

  if (state === "error") {
    return <span className="text-xs text-red-500">Failed</span>;
  }

  if (undone) {
    return (
      <span className="text-xs text-zinc-400 line-through dark:text-zinc-500">
        Undone
      </span>
    );
  }

  return null;
}
