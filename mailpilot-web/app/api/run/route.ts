import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export interface RunJobProgress {
  phase: string;
  message: string;
  timestamp: string;
}

export interface RunJobRow {
  id: number;
  status: "pending" | "running" | "done" | "failed";
  options: Record<string, unknown>;
  result: {
    accounts_processed?: number;
    candidates?: number;
    processed?: number;
    labels_applied?: number;
    archived?: number;
    spam_marked?: number;
    dry_run?: boolean;
  } | null;
  error: string | null;
  progress: RunJobProgress | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * POST /api/run
 * Body: { newer_than_days?: number; include_read?: boolean; dry_run?: boolean }
 * Creates a pending run_job for the authenticated user.
 */
export async function POST(request: Request) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const options: Record<string, unknown> = {};
  try {
    const body = await request.json();
    const { newer_than_days, include_read, dry_run } = body;
    if (newer_than_days !== undefined) options.newer_than_days = Number(newer_than_days);
    if (include_read !== undefined) options.include_read = Boolean(include_read);
    if (dry_run !== undefined) options.dry_run = Boolean(dry_run);
  } catch {
    // Empty body is fine — default options
  }

  // Use anon client so the RLS insert policy fires (auth.uid() = user_id)
  const { data, error } = await sessionClient
    .from("run_jobs")
    .insert({ user_id: user.id, options })
    .select(
      "id, status, options, result, error, progress, created_at, started_at, completed_at"
    )
    .single();

  if (error) {
    console.error("Failed to create run_job:", error);
    return NextResponse.json(
      { error: "Failed to queue run job" },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: 201 });
}

/**
 * GET /api/run
 * Returns the most recent run_job for the authenticated user, or a specific row
 * when `?job_id=<id>` is passed (must belong to the current user).
 */
export async function GET(request: Request) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

  // Use service client so we always get the authoritative row including
  // fields written by the Python runner (which bypasses RLS).
  const svc = createServiceClient();
  const base = svc
    .from("run_jobs")
    .select(
      "id, status, options, result, error, progress, created_at, started_at, completed_at"
    )
    .eq("user_id", user.id);

  const { data, error } = jobId
    ? await base.eq("id", jobId).maybeSingle()
    : await base.order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch job status" }, { status: 500 });
  }

  return NextResponse.json(data ?? null);
}
