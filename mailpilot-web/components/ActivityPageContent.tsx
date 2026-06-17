"use client";

import { ActionLogTable } from "@/components/ActionLogTable";
import { EmailActivityTable } from "@/components/EmailActivityTable";
import type { ProcessedEmailRow } from "@/lib/emailActivity";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { useState } from "react";

type ActivityView = "history" | "audit";

interface ActivityPageContentProps {
  initialRows: ProcessedEmailRow[];
  initialTotal: number;
  pageSize: number;
  categoryCounts: Record<string, number>;
  totalCount: number | null;
}

export function ActivityPageContent({
  initialRows,
  initialTotal,
  pageSize,
  categoryCounts,
  totalCount,
}: ActivityPageContentProps) {
  const [view, setView] = useState<ActivityView>("history");

  return (
    <div className="space-y-4">
      <div
        className="inline-flex rounded-lg border border-border-subtle bg-surface-2 p-1"
        role="tablist"
        aria-label="Activity views"
      >
        {(
          [
            ["history", "Processed mail"],
            ["audit", "Audit trail"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            onClick={() => setView(value)}
            className={cn(
              "inline-flex min-h-10 items-center rounded-md px-4 text-sm font-medium transition-colors",
              focusRing,
              view === value
                ? "bg-surface-1 text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "history" ? (
        <EmailActivityTable
          initialRows={initialRows}
          initialTotal={initialTotal}
          pageSize={pageSize}
          paginate
          categoryCounts={categoryCounts}
          totalCount={totalCount}
        />
      ) : (
        <ActionLogTable />
      )}
    </div>
  );
}
