"use client";

import type { RunJobRow } from "@/app/api/run/route";
import { Loader2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type JobStatus = RunJobRow["status"] | "idle";

interface RunOptions {
  newer_than_days: number;
  include_read: boolean;
  dry_run: boolean;
}

const DEFAULT_OPTIONS: RunOptions = {
  newer_than_days: 7,
  include_read: false,
  dry_run: false,
};

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function StatusIndicator({ status }: { status: JobStatus }) {
  if (status === "idle") return null;

  if (status === "pending") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
        </span>
        <span>Waiting for runner</span>
      </div>
    );
  }

  if (status === "running") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
        <span>Syncing…</span>
      </div>
    );
  }

  return null;
}

function ResultSummary({ job }: { job: RunJobRow | null }) {
  if (!job) return null;

  if (job.status === "done" && job.result) {
    const r = job.result;
    const isDry = r.dry_run;
    const prefix = isDry ? "Would have: " : "";
    return (
      <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-950/80">
        <p className="text-xs font-medium text-green-800 dark:text-green-300">
          Run complete
          {isDry && (
            <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] dark:bg-green-900">
              dry run
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-green-700 dark:text-green-400">
          {r.accounts_processed ?? 0} account(s) · {r.candidates ?? 0} messages ·{" "}
          {r.processed ?? 0} processed. {prefix}Labels: {r.labels_applied ?? 0}, archived:{" "}
          {r.archived ?? 0}, spam: {r.spam_marked ?? 0}.
        </p>
      </div>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-950/80">
        <p className="text-xs font-medium text-red-700 dark:text-red-400">Run failed</p>
        {job.error && (
          <p className="mt-0.5 break-all font-mono text-[10px] text-red-600 dark:text-red-500">
            {job.error}
          </p>
        )}
      </div>
    );
  }

  return null;
}

interface Props {
  initialJob: RunJobRow | null;
}

export function RunSyncControl({ initialJob }: Props) {
  const [job, setJob] = useState<RunJobRow | null>(initialJob);
  const [options, setOptions] = useState<RunOptions>(DEFAULT_OPTIONS);
  const [submitting, setSubmitting] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/run");
      if (res.ok) {
        const data: RunJobRow | null = await res.json();
        setJob(data);
        if (data && (data.status === "done" || data.status === "failed")) {
          stopPolling();
        }
      }
    } catch {
      // keep polling
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    setTimedOut(false);
    pollingRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
    timeoutRef.current = setTimeout(() => {
      stopPolling();
      setTimedOut(true);
    }, POLL_TIMEOUT_MS);
  }, [pollStatus, stopPolling]);

  useEffect(() => {
    if (
      initialJob &&
      (initialJob.status === "pending" || initialJob.status === "running")
    ) {
      startPolling();
    }
    return stopPolling;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function closeModal() {
    dialogRef.current?.close();
  }

  async function handleRun() {
    setSubmitting(true);
    setTimedOut(false);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const newJob: RunJobRow = await res.json();
      setJob(newJob);
      startPolling();
      closeModal();
    } catch (err) {
      console.error("Failed to queue run:", err);
    } finally {
      setSubmitting(false);
    }
  }

  const currentStatus: JobStatus =
    job?.status === "pending" || job?.status === "running" ? job.status : "idle";
  const isActive = currentStatus === "pending" || currentStatus === "running";
  const isFinished = job?.status === "done" || job?.status === "failed";

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        disabled={submitting || isActive}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[7.5rem] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
      >
        <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
        {submitting ? "Queuing…" : isActive ? "Running…" : "Run sync"}
      </button>

      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 z-50 m-0 w-[min(calc(100vw-2rem),24rem)] max-h-[min(90vh,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/50 open:flex open:flex-col dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
                  setOptions((o) => ({
                    ...o,
                    newer_than_days: Number(e.target.value),
                  }))
                }
                className="min-w-0 flex-1 accent-indigo-600"
              />
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
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
                  setOptions((o) => ({ ...o, include_read: e.target.checked }))
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
                  setOptions((o) => ({ ...o, dry_run: e.target.checked }))
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

      <div className="min-w-0 space-y-2">
        <StatusIndicator status={currentStatus} />
        {timedOut && (
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            Still pending after 5 min — ensure the runner is active (
            <code className="rounded bg-yellow-100 px-1 text-[10px] dark:bg-yellow-950">
              watch-jobs
            </code>
            ).
          </p>
        )}
        {isFinished && <ResultSummary job={job} />}
      </div>
    </div>
  );
}
