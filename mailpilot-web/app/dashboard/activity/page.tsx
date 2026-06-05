import { EmailActivityTable } from "@/components/EmailActivityTable";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getDashboardMetrics,
  getEmailActivityPage,
} from "@/lib/dashboard/queries";
import { redirect } from "next/navigation";

export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [activity, metrics] = await Promise.all([
    getEmailActivityPage(user.id),
    getDashboardMetrics(user.id),
  ]);

  return (
    <section>
      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Email activity
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Search and filter processed mail, then load more to browse your full history.
        </p>
      </div>
      <EmailActivityTable
        initialRows={activity.rows}
        initialTotal={activity.total}
        pageSize={activity.limit}
        paginate
        categoryCounts={metrics.by_category}
        totalCount={metrics.total_processed}
      />
    </section>
  );
}
