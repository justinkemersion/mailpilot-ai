import { getCurrentUser } from "@/lib/auth/session";
import { blockIfDemoMode } from "@/lib/demo";
import {
  isCategoryActionPolicy,
  isPreferenceMatchType,
  validatePreferenceWrite,
  type PreferenceWriteInput,
} from "@/lib/preferenceGuard";
import {
  PREFERENCE_SELECT,
  type MailPreferenceRow,
} from "@/lib/preferences";
import { fluxJson, postgrestParams } from "@/lib/flux/client";
import { NextResponse } from "next/server";

function parseAccountId(value: string | null): number | null {
  if (!value) return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function parsePreferenceId(value: unknown): number | null {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/** GET /api/preferences — list account-scoped teach rules for the signed-in user. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const accountId = parseAccountId(new URL(request.url).searchParams.get("account_id"));
  const params: Array<[string, string]> = [
    ["select", `${PREFERENCE_SELECT},accounts(email)`],
    ["user_id", `eq.${user.id}`],
    ["order", "created_at.desc"],
  ];
  if (accountId !== null) {
    params.push(["account_id", `eq.${accountId}`]);
  }

  try {
    const preferences = await fluxJson<MailPreferenceRow[]>(
      `/mail_preferences${postgrestParams(params)}`
    );
    return NextResponse.json({ preferences });
  } catch (err) {
    console.error("preferences GET:", err);
    return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 });
  }
}

interface PreferencePostBody {
  account_id?: unknown;
  match_type?: unknown;
  match_conditions_json?: unknown;
  action_policy?: unknown;
  category_id?: unknown;
  category_slug?: unknown;
}

/** POST /api/preferences — create a validated preference row. */
export async function POST(request: Request) {
  const blocked = await blockIfDemoMode();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: PreferencePostBody;
  try {
    body = (await request.json()) as PreferencePostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const accountId = Number(body.account_id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return NextResponse.json({ error: "account_id must be a positive integer" }, { status: 400 });
  }
  if (!isPreferenceMatchType(body.match_type)) {
    return NextResponse.json({ error: "Invalid match_type" }, { status: 400 });
  }
  if (!isCategoryActionPolicy(body.action_policy)) {
    return NextResponse.json({ error: "Invalid action_policy" }, { status: 400 });
  }
  if (
    body.match_conditions_json === null ||
    typeof body.match_conditions_json !== "object" ||
    Array.isArray(body.match_conditions_json)
  ) {
    return NextResponse.json({ error: "match_conditions_json must be an object" }, { status: 400 });
  }

  const writeInput: PreferenceWriteInput = {
    account_id: accountId,
    match_type: body.match_type,
    match_conditions_json: body.match_conditions_json as PreferenceWriteInput["match_conditions_json"],
    action_policy: body.action_policy,
    category_id:
      body.category_id === null || body.category_id === undefined
        ? null
        : Number(body.category_id) || null,
    category_slug: typeof body.category_slug === "string" ? body.category_slug : null,
  };

  const validation = validatePreferenceWrite(writeInput);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const accountRows = await fluxJson<Array<{ id: number }>>(
      `/accounts${postgrestParams([
        ["select", "id"],
        ["id", `eq.${accountId}`],
        ["user_id", `eq.${user.id}`],
      ])}`
    );
    if (!accountRows[0]) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
  } catch (err) {
    console.error("preferences POST account check:", err);
    return NextResponse.json({ error: "Failed to verify account" }, { status: 500 });
  }

  const now = new Date().toISOString();
  try {
    const rows = await fluxJson<MailPreferenceRow[]>(
      `/mail_preferences${postgrestParams([["select", PREFERENCE_SELECT]])}`,
      {
        method: "POST",
        json: [
          {
            user_id: user.id,
            account_id: accountId,
            match_type: writeInput.match_type,
            match_conditions_json: writeInput.match_conditions_json,
            category_id: writeInput.category_id,
            action_policy: writeInput.action_policy,
            confidence_threshold: 0,
            source: "user",
            enabled: true,
            created_at: now,
            updated_at: now,
          },
        ],
      }
    );
    const preference = rows[0];
    if (!preference) {
      return NextResponse.json({ error: "Failed to create preference" }, { status: 500 });
    }
    return NextResponse.json({ preference }, { status: 201 });
  } catch (err) {
    console.error("preferences POST:", err);
    return NextResponse.json({ error: "Failed to create preference" }, { status: 500 });
  }
}

interface PreferencePatchBody {
  id?: unknown;
  enabled?: unknown;
  action_policy?: unknown;
}

/** PATCH /api/preferences — enable/disable or update action policy. */
export async function PATCH(request: Request) {
  const blocked = await blockIfDemoMode();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: PreferencePatchBody;
  try {
    body = (await request.json()) as PreferencePatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const preferenceId = parsePreferenceId(body.id);
  if (preferenceId === null) {
    return NextResponse.json({ error: "id must be a positive integer" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    patch.enabled = body.enabled;
  }

  if ("action_policy" in body) {
    if (!isCategoryActionPolicy(body.action_policy)) {
      return NextResponse.json({ error: "Invalid action_policy" }, { status: 400 });
    }
    patch.action_policy = body.action_policy;
  }

  if (!("enabled" in body) && !("action_policy" in body)) {
    return NextResponse.json(
      { error: "Body must include enabled and/or action_policy" },
      { status: 400 }
    );
  }

  try {
    const rows = await fluxJson<MailPreferenceRow[]>(
      `/mail_preferences${postgrestParams([
        ["select", PREFERENCE_SELECT],
        ["id", `eq.${preferenceId}`],
        ["user_id", `eq.${user.id}`],
      ])}`,
      { method: "PATCH", json: patch }
    );
    const preference = rows[0];
    if (!preference) {
      return NextResponse.json({ error: "Preference not found" }, { status: 404 });
    }
    return NextResponse.json({ preference });
  } catch (err) {
    console.error("preferences PATCH:", err);
    return NextResponse.json({ error: "Failed to update preference" }, { status: 500 });
  }
}
