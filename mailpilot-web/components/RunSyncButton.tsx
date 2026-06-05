"use client";

import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, X } from "lucide-react";
import { useRef } from "react";

export interface RunSyncOptions {
  newer_than_days: number;
  include_read: boolean;
  dry_run: boolean;
}

interface RunSyncButtonProps {
  options: RunSyncOptions;
  onOptionsChange: (options: RunSyncOptions) => void;
  submitting: boolean;
  isActive: boolean;
  onRun: () => void | Promise<void>;
  className?: string;
}

export function RunSyncButton({
  options,
  onOptionsChange,
  submitting,
  isActive,
  onRun,
  className,
}: RunSyncButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function closeModal() {
    dialogRef.current?.close();
  }

  async function handleRun() {
    await onRun();
    closeModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        disabled={submitting || isActive}
        className={cn(
          className ??
            "inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[9rem] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700",
          focusRing
        )}
      >
        <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
        {submitting ? "Queuing…" : isActive ? "Running…" : "Run sync"}
      </button>

      <dialog
        ref={dialogRef}
        className="fixed top-1/2 left-1/2 z-50 m-0 w-[min(calc(100vw-2rem),24rem)] max-h-[min(90vh,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/50 open:flex open:flex-col dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      >
        <div className="flex items-start justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Run sync
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Queue a run for the worker. Requires{" "}
              <code className="rounded bg-zinc-100 px-1 text-[10px] dark:bg-zinc-800">
                watch-jobs
              </code>
              .
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Look back
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={30}
                value={options.newer_than_days}
                onChange={(e) =>
                  onOptionsChange({
                    ...options,
                    newer_than_days: Number(e.target.value),
                  })
                }
                className="min-w-0 flex-1 accent-indigo-600"
              />
              <span className="w-10 shrink-0 text-right text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                {options.newer_than_days}d
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-4">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={options.include_read}
                onChange={(e) =>
                  onOptionsChange({ ...options, include_read: e.target.checked })
                }
                className="h-4 w-4 rounded border-zinc-300 accent-indigo-600"
              />
              Include read
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={options.dry_run}
                onChange={(e) =>
                  onOptionsChange({ ...options, dry_run: e.target.checked })
                }
                className="h-4 w-4 rounded border-zinc-300 accent-indigo-600"
              />
              Dry run
            </label>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 px-4 py-3 sm:flex-row sm:justify-end dark:border-zinc-800">
          <button
            type="button"
            onClick={closeModal}
            className="min-h-11 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={submitting || isActive}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting…
              </>
            ) : (
              "Start sync"
            )}
          </button>
        </div>
      </dialog>
    </>
  );
}
