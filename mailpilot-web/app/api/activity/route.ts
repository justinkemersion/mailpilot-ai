import { getCurrentUser } from "@/lib/auth/session";
import { getEmailActivityPage } from "@/lib/dashboard/queries";
import { parseActivitySort } from "@/lib/activitySort";
import { EMAIL_ACTIVITY_PAGE_SIZE } from "@/lib/emailActivity";
import { NextResponse } from "next/server";

/** GET /api/activity — paginated processed email history for the authenticated user. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = Number.parseInt(
    searchParams.get("limit") ?? String(EMAIL_ACTIVITY_PAGE_SIZE),
    10
  );
  const category = searchParams.get("category");
  const sort = parseActivitySort(searchParams.get("sort"));

  const page = await getEmailActivityPage(user.id, {
    offset: Number.isFinite(offset) ? offset : 0,
    limit: Number.isFinite(limit) ? limit : EMAIL_ACTIVITY_PAGE_SIZE,
    category: category?.trim() || null,
    sort,
  });

  return NextResponse.json(page);
}
