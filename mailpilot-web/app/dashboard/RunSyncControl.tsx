"use client";

import type {
  RunJobProgress,
  RunJobRow,
} from "@/app/api/run/route";
import { RunResultBanner } from "@/components/RunResultBanner";
import { RunSyncButton, type RunSyncOptions } from "@/components/RunSyncButton";
import { classifierLabel } from "@/lib/formatClassifier";
import { Cpu, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type JobStatus = RunJobRow["status"] | "idle";

const DEFAULT_OPTIONS: RunSyncOptions = {
  newer_than_days: 7,
  include_read: false,
  dry_run: false,
};

const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const STATUS_FALLBACK_POLL_SCHEDULE_MS = [5000, 10000, 15000] as const;

function classifierLabelFromJob(job: RunJobRow | null): string | null {
  if (!job) return null;
  const fromResult = classifierLabel(job.result);
  if (fromResult) return fromResult;
  if (job.progress?.phase === "classifier") {
    return (
      job.progress.message.replace(/^AI classifier:\s*/i, "").trim() ||
      classifierLabel(job.result)
    );
  }
  return null;
}

function classifierLabelFromActivity(entries: RunJobProgress[]): string | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry.phase === "classifier") {
      return entry.message.replace(/^AI classifier:\s*/i, "").trim() || null;
    }
  }
  return null;
}

function ClassifierSourceBadge({
  label,
  pending = false,
  lastRun = false,
}: {
  label: string;
  pending?: boolean;
  lastRun?: boolean;
}) {
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-indigo-200 bg-indigo-50/90 px-3 py-2 dark:border-indigo-900/80 dark:bg-indigo-950/40"
      aria-label={`AI classifier: ${label}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {pending ? (
          <Loader2
            className="h-3.5 w-3.5 shrink-0 animate-spin text-indigo-600 dark:text-indigo-400"
            aria-hidden
          />
        ) : (
          <Cpu
            className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400"
            aria-hidden
          />
        )}
        <span className="text-[10px] font-semibold tracking-wide text-indigo-700 uppercase dark:text-indigo-300">
          AI classifier
        </span>
      </div>
      <span className="min-w-0 text-xs font-medium text-indigo-950 dark:text-indigo-100">
        {label}
      </span>
      {lastRun && (
        <span className="text-[10px] text-indigo-600/80 dark:text-indigo-400/90">
          last run
        </span>
      )}
    </div>
  );
}

async function fetchRunJobRow(jobId: number): Promise<RunJobRow | null> {
  const res = await fetch(`/api/run?job_id=${jobId}`);
  if (!res.ok) return null;
  return (await res.json()) as RunJobRow | null;
}

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

function ActivityLog({ entries }: { entries: RunJobProgress[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastKeyRef = useRef<string>("");

  useEffect(() => {
    if (entries.length === 0) {
      lastKeyRef.current = "";
      return;
    }
    const last = entries[entries.length - 1];
    const key = `${last.timestamp}:${last.message}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    const el = scrollerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div className="min-h-0 w-full min-w-0">
      <p className="mb-1.5 text-[10px] font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        Activity
      </p>
      <div
        ref={scrollerRef}
        className="max-h-44 min-h-[5.5rem] overflow-x-hidden overflow-y-auto scroll-smooth rounded-md border border-zinc-200 bg-zinc-50/90 px-2.5 py-2 overscroll-y-contain dark:border-zinc-700 dark:bg-zinc-950/50"
        aria-live="polite"
        role="log"
        aria-relevant="additions"
      >
        <ul className="space-y-2.5 pb-1">
          {entries.map((entry) => (
            <li
              key={entry.timestamp}
              className="animate-[run-job-activity-fade_0.35s_ease-out]"
            >
              <span
                className={
                  entry.phase === "ai_limit"
                    ? "text-[10px] font-medium text-amber-700 dark:text-amber-400"
                    : "text-[10px] font-medium text-indigo-600 dark:text-indigo-400"
                }
              >
                {entry.phase === "ai_limit" ? "AI limit" : entry.phase}
              </span>
              <p className="mt-0.5 text-xs leading-snug text-zinc-700 dark:text-zinc-300">
                {entry.message}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface Props {
  initialJob: RunJobRow | null;
  variant?: "default" | "section";
}

export function RunSyncControl({ initialJob, variant = "default" }: Props) {
  const router = useRouter();
  const [job, setJob] = useState<RunJobRow | null>(initialJob);
  const [options, setOptions] = useState<RunSyncOptions>(DEFAULT_OPTIONS);
  const [submitting, setSubmitting] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [activityLog, setActivityLog] = useState<RunJobProgress[]>([]);
  const [dismissedJobId, setDismissedJobId] = useState<number | null>(null);
  const prevJobRef = useRef<{ id: number; status: RunJobRow["status"] } | null>(
    null
  );

  const activeJobId =
    job?.status === "pending" || job?.status === "running" ? job.id : null;

  const refreshJob = useCallback(async (jobId: number) => {
    const data = await fetchRunJobRow(jobId);
    if (data?.id === jobId) setJob(data);
  }, []);

  const progressEntry = job?.progress;
  useEffect(() => {
    if (!progressEntry?.timestamp) return;
    const p = progressEntry;
    setActivityLog((prev) => {
      if (prev.some((e) => e.timestamp === p.timestamp)) return prev;
      return [...prev, p].slice(-25);
    });
  }, [progressEntry]);

  useEffect(() => {
    if (!job) {
      prevJobRef.current = null;
      return;
    }
    const prev = prevJobRef.current;
    if (prev && prev.id === job.id) {
      const wasActive = prev.status === "pending" || prev.status === "running";
      if (wasActive && job.status === "done") {
        setDismissedJobId(null);
        router.refresh();
      }
    }
    prevJobRef.current = { id: job.id, status: job.status };
  }, [job, router]);

  useEffect(() => {
    if (activeJobId == null) return;
    void refreshJob(activeJobId);
  }, [activeJobId, refreshJob]);

  useEffect(() => {
    if (activeJobId == null) return;

    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async (attempt: number) => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        await refreshJob(activeJobId);
      }

      const nextDelay =
        STATUS_FALLBACK_POLL_SCHEDULE_MS[
          Math.min(attempt + 1, STATUS_FALLBACK_POLL_SCHEDULE_MS.length - 1)
        ];
      timeoutId = window.setTimeout(() => {
        void poll(attempt + 1);
      }, nextDelay);
    };

    timeoutId = window.setTimeout(() => {
      void poll(0);
    }, STATUS_FALLBACK_POLL_SCHEDULE_MS[0]);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void refreshJob(activeJobId);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeJobId, refreshJob]);

  useEffect(() => {
    if (activeJobId == null) return;
    setTimedOut(false);
    const t = setTimeout(() => {
      setTimedOut(true);
      void refreshJob(activeJobId);
    }, POLL_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [activeJobId, refreshJob]);

  async function handleRun() {
    setSubmitting(true);
    setTimedOut(false);
    setActivityLog([]);
    setDismissedJobId(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const newJob = (await res.json()) as RunJobRow;
      setJob(newJob);
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
  const showResult =
    isFinished && job != null && dismissedJobId !== job.id;

  const classifierLabelActive =
    classifierLabelFromActivity(activityLog) ??
    (isActive ? classifierLabelFromJob(job) : null);
  const classifierLabelLastRun =
    !isActive && !classifierLabelActive ? classifierLabelFromJob(job) : null;

  const isSection = variant === "section";
  const rootClass = isSection
    ? "flex w-full min-w-0 flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none"
    : "flex w-full min-w-0 flex-col gap-2";

  return (
    <div className={rootClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div
          className={isSection ? "min-w-0" : "hidden min-w-0"}
          aria-hidden={!isSection}
        >
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            Manual sync
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Queue a one-time run for the worker (
            <code className="rounded bg-zinc-100 px-1 text-[10px] dark:bg-zinc-800">
              watch-jobs
            </code>
            ). Classifier is configured on the server and reported per run.
          </p>
        </div>
        <RunSyncButton
          options={options}
          onOptionsChange={setOptions}
          submitting={submitting}
          isActive={isActive}
          onRun={handleRun}
        />
      </div>

      <div
        className={`flex min-w-0 flex-col gap-3${isSection ? " border-t border-zinc-100 pt-3 dark:border-zinc-800" : ""}`}
      >
        {classifierLabelActive ? (
          <ClassifierSourceBadge label={classifierLabelActive} pending={isActive} />
        ) : classifierLabelLastRun ? (
          <ClassifierSourceBadge label={classifierLabelLastRun} lastRun />
        ) : isSection ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            AI classifier (Cloudflare or OpenAI) is chosen on the worker — run a sync to
            see which model was used.
          </p>
        ) : null}
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
        {(isActive || activityLog.length > 0) && (
          <ActivityLog entries={activityLog} />
        )}
        {showResult && job ? (
          <RunResultBanner
            job={job}
            onDismiss={() => setDismissedJobId(job.id)}
          />
        ) : null}
      </div>
    </div>
  );
}
