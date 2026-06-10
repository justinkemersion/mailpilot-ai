import { getCurrentUser } from "@/lib/auth/session";
import { blockIfDemoMode } from "@/lib/demo";
import { fluxJson, postgrestParams } from "@/lib/flux/client";
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
  const blocked = await blockIfDemoMode();
  if (blocked) return blocked;

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

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const updatedAt = new Date().toISOString();
  let data: AccountPublicRow[];
  try {
    data = await fluxJson<AccountPublicRow[]>(
      `/accounts${postgrestParams([
        [
          "select",
          "id,email,display_name,active,processing_enabled,created_at,updated_at",
        ],
        ["id", `eq.${accountId}`],
        ["user_id", `eq.${user.id}`],
      ])}`,
      {
        method: "PATCH",
        json: { processing_enabled, updated_at: updatedAt },
      }
    );
  } catch (err) {
    console.error("accounts PATCH:", err);
    return NextResponse.json({ error: "Could not update account" }, { status: 500 });
  }

  const account = data[0];
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ account });
}

/**
 * DELETE /api/accounts/:id
 * Removes the linked Gmail account row (cascades per schema).
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const blocked = await blockIfDemoMode();
  if (blocked) return blocked;

  const { id: idParam } = await context.params;
  const accountId = parseAccountId(idParam);
  if (accountId === null) {
    return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let data: Array<{ id: number }>;
  try {
    data = await fluxJson<Array<{ id: number }>>(
      `/accounts${postgrestParams([
        ["select", "id"],
        ["id", `eq.${accountId}`],
        ["user_id", `eq.${user.id}`],
      ])}`,
      { method: "DELETE" }
    );
  } catch (err) {
    console.error("accounts DELETE:", err);
    return NextResponse.json({ error: "Could not disconnect account" }, { status: 500 });
  }

  const deleted = data[0];
  if (!deleted) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true as const, id: deleted.id });
}
