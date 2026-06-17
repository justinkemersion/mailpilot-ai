import { getCurrentUser } from "@/lib/auth/session";
import { countCleanupCandidates } from "@/lib/cleanup";
import { getCleanupGroups } from "@/lib/dashboard/queries";
import { NextResponse } from "next/server";

/** GET /api/cleanup/candidates — unresolved inbox resolution queue grouped by safety tier. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const groups = await getCleanupGroups(user.id);
    return NextResponse.json({
      groups,
      total: countCleanupCandidates(groups),
    });
  } catch (err) {
    console.error("cleanup candidates GET:", err);
    return NextResponse.json(
      { error: "Failed to load cleanup candidates" },
      { status: 500 }
    );
  }
}
