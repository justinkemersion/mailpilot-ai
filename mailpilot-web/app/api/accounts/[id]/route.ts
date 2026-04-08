import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export interface AccountPublicRow {
  id: number;
  email: string;
  display_name: string | null;
  active: boolean;
  processing_enabled: boolean;
  created_at: string;
  updated_at: string;
}

function parseAccountId(idParam: string): number | null {
  const accountId = Number(idParam);
  if (!Number.isFinite(accountId) || accountId <= 0) return null;
  return accountId;
}

/**
 * PATCH /api/accounts/:id
 * Body: { processing_enabled: boolean }
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await context.params;
  const accountId = parseAccountId(idParam);
  if (accountId === null) {
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
    .select("id, email, display_name, active, processing_enabled, created_at, updated_at")
    .maybeSingle();

  if (error) {
    console.error("accounts PATCH:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ account: data as AccountPublicRow });
}

/**
 * DELETE /api/accounts/:id
 * Removes the linked Gmail account row (cascades per schema).
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await context.params;
  const accountId = parseAccountId(idParam);
  if (accountId === null) {
    return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("accounts DELETE:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true as const, id: data.id });
}
