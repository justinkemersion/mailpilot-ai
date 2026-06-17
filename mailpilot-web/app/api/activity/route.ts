import { getCurrentUser } from "@/lib/auth/session";
import { getEmailActivityPage, type ActivitySort } from "@/lib/dashboard/queries";
import { EMAIL_ACTIVITY_PAGE_SIZE } from "@/lib/emailActivity";
import { NextResponse } from "next/server";

const SORT_VALUES = new Set<ActivitySort>(["received_desc", "account_asc", "account_desc"]);

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
  const sortParam = searchParams.get("sort");
  const sort =
    sortParam && SORT_VALUES.has(sortParam as ActivitySort)
      ? (sortParam as ActivitySort)
      : "received_desc";

  const page = await getEmailActivityPage(user.id, {
    offset: Number.isFinite(offset) ? offset : 0,
    limit: Number.isFinite(limit) ? limit : EMAIL_ACTIVITY_PAGE_SIZE,
    category: category?.trim() || null,
    sort,
  });

  return NextResponse.json(page);
}
