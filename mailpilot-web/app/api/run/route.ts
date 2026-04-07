import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

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

  let options: Record<string, unknown> = {};
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
    .select("id, status, created_at")
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
 * Returns the most recent run_job for the authenticated user (for status polling).
 */
export async function GET() {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Use service client so we always get the authoritative row including
  // fields written by the Python runner (which bypasses RLS).
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("run_jobs")
    .select("id, status, options, result, error, created_at, started_at, completed_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch job status" }, { status: 500 });
  }

  return NextResponse.json(data ?? null);
}
