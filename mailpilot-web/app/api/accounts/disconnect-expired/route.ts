import { getCurrentUser } from "@/lib/auth/session";
import { getConnectedAccounts } from "@/lib/dashboard/queries";
import { blockIfDemoMode } from "@/lib/demo";
import {
  DISCONNECTED_TOKEN_JSON,
  normalizeMailboxEmail,
} from "@/lib/mailboxIdentity";
import { fluxJson, postgrestParams } from "@/lib/flux/client";
import { NextResponse } from "next/server";

function normalizeEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const email = normalizeMailboxEmail(item);
    if (!email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/**
 * POST /api/accounts/disconnect-expired
 * Body: { emails: string[] }
 * Soft-disconnects linked Gmail rows (preserves history): clears tokens, marks needs_reauth.
 */
export async function POST(request: Request) {
  const blocked = await blockIfDemoMode();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const requested = normalizeEmails(
    typeof body === "object" && body !== null && "emails" in body
      ? (body as { emails: unknown }).emails
      : []
  );

  if (requested.length === 0) {
    return NextResponse.json({ disconnected: [] as string[] });
  }

  const accounts = await getConnectedAccounts(user.id);
  const requestedSet = new Set(requested);
  const toDisconnect = accounts.filter((a) =>
    requestedSet.has(normalizeMailboxEmail(a.email))
  );

  const disconnected: string[] = [];
  const updatedAt = new Date().toISOString();

  for (const account of toDisconnect) {
    try {
      const data = await fluxJson<Array<{ id: number; email: string }>>(
        `/accounts${postgrestParams([
          ["select", "id,email"],
          ["id", `eq.${account.id}`],
          ["user_id", `eq.${user.id}`],
        ])}`,
        {
          method: "PATCH",
          json: {
            active: false,
            needs_reauth: true,
            token_json: DISCONNECTED_TOKEN_JSON,
            updated_at: updatedAt,
          },
        }
      );
      if (data[0]?.email) {
        disconnected.push(data[0].email);
      }
    } catch (err) {
      console.error("disconnect-expired PATCH:", account.id, err);
    }
  }

  return NextResponse.json({ disconnected });
}
