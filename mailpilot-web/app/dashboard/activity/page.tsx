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
      <div className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Email activity
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          Processed mail across all connected accounts. Search and filter, then load
          more to browse history.
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
