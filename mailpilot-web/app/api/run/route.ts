import { getCurrentUser } from "@/lib/auth/session";
import {
  createSimulatedDemoSyncJob,
  getDemoLatestJob,
  isDemoRequest,
} from "@/lib/demo";
import { fluxFetch, fluxJson, postgrestParams } from "@/lib/flux/client";
import type { ClassifierInfo } from "@/lib/formatClassifier";
import { NextResponse } from "next/server";

const RUN_JOB_SELECT =
  "id,status,options,result,error,progress,created_at,started_at,completed_at";

export interface RunJobProgress {
  phase: string;
  message: string;
  timestamp: string;
}

export interface RunJobRow {
  id: number;
  status: "pending" | "running" | "done" | "failed";
  options: Record<string, unknown>;
  result: ({
    accounts_processed?: number;
    candidates?: number;
    processed?: number;
    labels_applied?: number;
    archived?: number;
    spam_marked?: number;
    dry_run?: boolean;
    llm_calls?: number;
    prefiltered?: number;
    skipped_by_budget?: number;
    skipped_by_claim_conflict?: number;
    skipped_by_ai_limit?: number;
    ai_limit_hit?: boolean;
    ai_limit_message?: string | null;
    demo_message?: string;
    accounts_needing_reauth?: string[];
  } & ClassifierInfo) | null;
  error: string | null;
  progress: RunJobProgress | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

async function getActiveJob(userId: string): Promise<RunJobRow | null> {
  const rows = await fluxJson<RunJobRow[]>(
    `/run_jobs${postgrestParams([
      ["select", RUN_JOB_SELECT],
      ["user_id", `eq.${userId}`],
      ["status", "in.(pending,running)"],
      ["order", "created_at.desc"],
      ["limit", 1],
    ])}`
  );
  return rows[0] ?? null;
}

function isUniqueViolation(status: number, detail: string): boolean {
  return (
    status === 409 ||
    detail.includes("run_jobs_one_active_per_user_idx") ||
    detail.includes("duplicate key value")
  );
}

/**
 * POST /api/run
 * Body: { newer_than_days?: number; include_read?: boolean; dry_run?: boolean }
 * Creates a pending run_job for the authenticated user.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (await isDemoRequest()) {
    return NextResponse.json(createSimulatedDemoSyncJob(), { status: 201 });
  }

  const options: Record<string, unknown> = {};
  try {
    const body = await request.json();
    const { newer_than_days, include_read, dry_run } = body;
    if (newer_than_days !== undefined) options.newer_than_days = Number(newer_than_days);
    if (include_read !== undefined) options.include_read = Boolean(include_read);
    if (dry_run !== undefined) options.dry_run = Boolean(dry_run);
  } catch {
    // Empty body is fine.
  }

  try {
    const activeJob = await getActiveJob(user.id);
    if (activeJob) {
      return NextResponse.json(activeJob, { status: 200 });
    }
  } catch (err) {
    console.error("Failed to look up active run_job:", err);
    return NextResponse.json({ error: "Failed to queue run job" }, { status: 500 });
  }

  const res = await fluxFetch(`/run_jobs?select=${encodeURIComponent(RUN_JOB_SELECT)}`, {
    method: "POST",
    json: { user_id: user.id, options },
  });

  if (!res.ok) {
    const detail = await res.text();
    if (isUniqueViolation(res.status, detail)) {
      try {
        const existingJob = await getActiveJob(user.id);
        if (existingJob) {
          return NextResponse.json(existingJob, { status: 200 });
        }
      } catch (err) {
        console.error("Failed to fetch existing active run_job:", err);
      }
    }
    console.error("Failed to create run_job:", detail);
    return NextResponse.json(
      { error: "Failed to queue run job" },
      { status: 500 }
    );
  }

  const rows = (await res.json()) as RunJobRow[];
  return NextResponse.json(rows[0] ?? null, { status: 201 });
}

/**
 * GET /api/run
 * Returns the most recent run_job for the authenticated user, or a specific row
 * when `?job_id=<id>` is passed.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (await isDemoRequest()) {
    return NextResponse.json(getDemoLatestJob());
  }

  const url = new URL(request.url);
  const jobIdParam = url.searchParams.get("job_id");
  let jobId: number | null = null;
  if (jobIdParam !== null && jobIdParam !== "") {
    const n = Number(jobIdParam);
    if (!Number.isSafeInteger(n) || n <= 0) {
      return NextResponse.json({ error: "Invalid job_id" }, { status: 400 });
    }
    jobId = n;
  }

  try {
    const rows = await fluxJson<RunJobRow[]>(
      `/run_jobs${postgrestParams([
        ["select", RUN_JOB_SELECT],
        ["user_id", `eq.${user.id}`],
        ...(jobId ? ([["id", `eq.${jobId}`]] as Array<[string, string]>) : []),
        ["order", "created_at.desc"],
        ["limit", 1],
      ])}`
    );
    return NextResponse.json(rows[0] ?? null);
  } catch (err) {
    console.error("Failed to fetch job status:", err);
    return NextResponse.json({ error: "Failed to fetch job status" }, { status: 500 });
  }
}
