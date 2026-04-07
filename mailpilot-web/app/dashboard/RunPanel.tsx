"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RunJobRow } from "@/app/api/run/route";

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
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function StatusIndicator({ status }: { status: JobStatus }) {
  if (status === "idle") return null;

  if (status === "pending") {
    return (
      <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-500" />
        </span>
        Waiting for runner…
      </div>
    );
  }

  if (status === "running") {
    return (
      <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
        <svg
          className="h-4 w-4 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Processing your inbox…
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
      <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3 dark:bg-green-950 dark:border-green-800">
        <p className="text-sm font-medium text-green-800 dark:text-green-300">
          Run complete
          {isDry && (
            <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs dark:bg-green-900">
              dry run
            </span>
          )}
        </p>
        <p className="mt-1 text-sm text-green-700 dark:text-green-400">
          {r.accounts_processed ?? 0} account(s) · {r.candidates ?? 0} inbox messages ·{" "}
          {r.processed ?? 0} processed.{" "}
          {prefix}Labels: {r.labels_applied ?? 0}, archived: {r.archived ?? 0},
          spam: {r.spam_marked ?? 0}.
        </p>
      </div>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 dark:bg-red-950 dark:border-red-800">
        <p className="text-sm font-medium text-red-700 dark:text-red-400">Run failed</p>
        {job.error && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-500 font-mono break-all">
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

export function RunPanel({ initialJob }: Props) {
  const [job, setJob] = useState<RunJobRow | null>(initialJob);
  const [options, setOptions] = useState<RunOptions>(DEFAULT_OPTIONS);
  const [showOptions, setShowOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

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
      // network error — keep polling
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

  // If the page hydrates with an active job, start polling immediately
  useEffect(() => {
    if (
      initialJob &&
      (initialJob.status === "pending" || initialJob.status === "running")
    ) {
      startPolling();
    }
    return stopPolling;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="rounded-xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Process inbox
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Queue a run for the MailPilot worker to classify and triage your
            inbox. Requires the runner to be active (
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">
              python -m mailpilot.main watch-jobs
            </code>
            ).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <StatusIndicator status={currentStatus} />
          <button
            onClick={handleRun}
            disabled={submitting || isActive}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M2 2.75A.75.75 0 0 1 2.75 2h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 2.75Zm0 5A.75.75 0 0 1 2.75 7h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 2 7.75ZM2 12.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" />
            </svg>
            {submitting ? "Queuing…" : isActive ? "Running…" : "Process now"}
          </button>
        </div>
      </div>

      {/* Options toggle */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowOptions((v) => !v)}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        >
          <svg
            className={`h-3.5 w-3.5 transition-transform ${showOptions ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 16 16"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 4l4 4-4 4" />
          </svg>
          {showOptions ? "Hide options" : "Options"}
        </button>

        {showOptions && (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
            {/* Days back */}
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
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
                  className="w-full accent-indigo-600"
                />
                <span className="w-12 text-right text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {options.newer_than_days}d
                </span>
              </div>
            </div>

            {/* Include read */}
            <div className="flex items-center gap-2">
              <input
                id="include-read"
                type="checkbox"
                checked={options.include_read}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, include_read: e.target.checked }))
                }
                className="h-4 w-4 rounded border-zinc-300 accent-indigo-600"
              />
              <label
                htmlFor="include-read"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400 cursor-pointer"
              >
                Include read emails
              </label>
            </div>

            {/* Dry run */}
            <div className="flex items-center gap-2">
              <input
                id="dry-run"
                type="checkbox"
                checked={options.dry_run}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, dry_run: e.target.checked }))
                }
                className="h-4 w-4 rounded border-zinc-300 accent-indigo-600"
              />
              <label
                htmlFor="dry-run"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400 cursor-pointer"
              >
                Dry run (preview only)
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Timed-out notice */}
      {timedOut && (
        <div className="mt-3 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-700 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-400">
          The job is still pending after 5 minutes. Make sure the runner is
          active:{" "}
          <code className="rounded bg-yellow-100 px-1 dark:bg-yellow-900">
            python -m mailpilot.main watch-jobs
          </code>
        </div>
      )}

      {/* Result / error */}
      {isFinished && <ResultSummary job={job} />}
    </div>
  );
}
