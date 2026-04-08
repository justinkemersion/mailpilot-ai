import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * PATCH /api/accounts/:id/processing
 * Body: { processing_enabled: boolean }
 * Updates whether the MailPilot worker should process this account (RLS: own rows only).
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await context.params;
  const accountId = Number(idParam);
  if (!Number.isFinite(accountId) || accountId <= 0) {
    return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("processing_enabled" in body) ||
    typeof (body as { processing_enabled: unknown }).processing_enabled !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Body must include processing_enabled: boolean" },
      { status: 400 }
    );
  }

  const processing_enabled = (body as { processing_enabled: boolean }).processing_enabled;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const updatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("accounts")
    .update({ processing_enabled, updated_at: updatedAt })
    .eq("id", accountId)
    .eq("user_id", user.id)
    .eq("active", true)
    .select("id, processing_enabled")
    .maybeSingle();

  if (error) {
    console.error("accounts processing_enabled update:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id,
    processing_enabled: data.processing_enabled,
  });
}
