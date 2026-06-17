import { getCurrentUser } from "@/lib/auth/session";
import {
  isAccountPurpose,
  isDefaultArchivePolicy,
  isSecurityPosture,
  suggestedScopeForPurpose,
  type AccountPurpose,
} from "@/lib/accountScope";
import { blockIfDemoMode } from "@/lib/demo";
import { fluxJson, postgrestParams } from "@/lib/flux/client";
import { NextResponse } from "next/server";

export interface AccountScopeRow {
  id: number;
  email: string;
  display_name: string | null;
  active: boolean;
  processing_enabled: boolean;
  purpose: AccountPurpose;
  default_archive_policy: string;
  security_posture: string;
  scope_configured_at: string | null;
  created_at: string;
  updated_at: string;
}

function parseAccountId(idParam: string): number | null {
  const accountId = Number(idParam);
  if (!Number.isFinite(accountId) || accountId <= 0) return null;
  return accountId;
}

const SCOPE_SELECT =
  "id,email,display_name,active,processing_enabled,purpose,default_archive_policy,security_posture,scope_configured_at,created_at,updated_at";

interface ScopePatchBody {
  purpose?: unknown;
  default_archive_policy?: unknown;
  security_posture?: unknown;
}

/**
 * PATCH /api/accounts/:id/scope
 * Body: { purpose?, default_archive_policy?, security_posture? }
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

  let body: ScopePatchBody;
  try {
    body = (await request.json()) as ScopePatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasPurpose = "purpose" in body;
  const hasPolicy = "default_archive_policy" in body;
  const hasPosture = "security_posture" in body;

  if (!hasPurpose && !hasPolicy && !hasPosture) {
    return NextResponse.json(
      {
        error:
          "Body must include at least one of: purpose, default_archive_policy, security_posture",
      },
      { status: 400 }
    );
  }

  const patch: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };

  if (hasPurpose) {
    if (typeof body.purpose !== "string" || !isAccountPurpose(body.purpose)) {
      return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
    }
    patch.purpose = body.purpose;
    patch.scope_configured_at = new Date().toISOString();
    const suggested = suggestedScopeForPurpose(body.purpose);
    if (!hasPolicy) {
      patch.default_archive_policy = suggested.default_archive_policy;
    }
    if (!hasPosture) {
      patch.security_posture = suggested.security_posture;
    }
  }

  if (hasPolicy) {
    if (
      typeof body.default_archive_policy !== "string" ||
      !isDefaultArchivePolicy(body.default_archive_policy)
    ) {
      return NextResponse.json(
        { error: "Invalid default_archive_policy" },
        { status: 400 }
      );
    }
    patch.default_archive_policy = body.default_archive_policy;
  }

  if (hasPosture) {
    if (
      typeof body.security_posture !== "string" ||
      !isSecurityPosture(body.security_posture)
    ) {
      return NextResponse.json({ error: "Invalid security_posture" }, { status: 400 });
    }
    patch.security_posture = body.security_posture;
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let data: AccountScopeRow[];
  try {
    data = await fluxJson<AccountScopeRow[]>(
      `/accounts${postgrestParams([
        ["select", SCOPE_SELECT],
        ["id", `eq.${accountId}`],
        ["user_id", `eq.${user.id}`],
      ])}`,
      { method: "PATCH", json: patch }
    );
  } catch (err) {
    console.error("accounts scope PATCH:", err);
    return NextResponse.json({ error: "Could not update account scope" }, { status: 500 });
  }

  const account = data[0];
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ account });
}
