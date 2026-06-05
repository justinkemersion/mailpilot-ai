import { MetricCard } from "@/components/ui/MetricCard";
import type { DashboardMetrics } from "@/lib/dashboard/queries";
import { Archive, Inbox, Mail, Tag } from "lucide-react";

interface OverviewMetricsGridProps {
  metrics: DashboardMetrics;
}

export function OverviewMetricsGrid({ metrics }: OverviewMetricsGridProps) {
  return (
    <section aria-label="Overview metrics">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
    </section>
  );
}
