import { CategoryPill } from "@/components/ui/CategoryPill";
import { MetricCard } from "@/components/ui/MetricCard";
import { sortCategoriesUnique } from "@/lib/categories";
import type { DashboardMetrics } from "@/lib/dashboard/queries";
import { Archive, Inbox, Mail, Tag } from "lucide-react";

interface OverviewMetricsGridProps {
  metrics: DashboardMetrics;
}

function topCategories(byCategory: Record<string, number>, limit = 3): string[] {
  return sortCategoriesUnique(Object.keys(byCategory))
    .filter((c) => (byCategory[c] ?? 0) > 0)
    .sort((a, b) => (byCategory[b] ?? 0) - (byCategory[a] ?? 0))
    .slice(0, limit);
}

export function OverviewMetricsGrid({ metrics }: OverviewMetricsGridProps) {
  const topCats = topCategories(metrics.by_category);

  return (
    <section aria-label="Overview metrics" className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Emails processed"
          value={metrics.total_processed}
          caption="All time"
          icon={Inbox}
        />
        <MetricCard
          label="Archived"
          value={metrics.total_archived}
          caption="All time"
          icon={Archive}
        />
        <MetricCard
          label="Labeled"
          value={metrics.total_labeled}
          caption="All time"
          icon={Tag}
        />
        <MetricCard
          label="Active accounts"
          value={metrics.active_accounts}
          icon={Mail}
        />
      </div>
      {topCats.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Top categories
          </span>
          {topCats.map((category) => (
            <CategoryPill key={category} category={category} size="sm" />
          ))}
        </div>
      ) : null}
    </section>
  );
}
