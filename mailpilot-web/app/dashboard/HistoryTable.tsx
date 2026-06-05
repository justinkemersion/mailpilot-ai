import { EmailActivityTable } from "@/components/EmailActivityTable";
import type { ProcessedEmailRow } from "@/lib/emailActivity";

export type { ProcessedEmailRow };

interface HistoryTableProps {
  rows: ProcessedEmailRow[];
  categoryCounts?: Record<string, number>;
  totalCount?: number | null;
}

/** Compact activity table for overview — no server pagination. */
export function HistoryTable({
  rows,
  categoryCounts,
  totalCount,
}: HistoryTableProps) {
  return (
    <EmailActivityTable
      initialRows={rows}
      initialTotal={rows.length}
      paginate={false}
      categoryCounts={categoryCounts}
      totalCount={totalCount}
    />
  );
}
