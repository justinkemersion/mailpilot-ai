import { getCurrentUser } from "@/lib/auth/session";
import { getDashboardMetrics } from "@/lib/dashboard/queries";
import { NextResponse } from "next/server";

/** GET /api/metrics — aggregate processed-email counts for the authenticated user. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const metrics = await getDashboardMetrics(user.id);
  return NextResponse.json(metrics);
}
