import { EmailActivityTable } from "@/components/EmailActivityTable";
import type { ProcessedEmailRow } from "@/lib/emailActivity";

export type { ProcessedEmailRow };

interface HistoryTableProps {
  rows: ProcessedEmailRow[];
  labelledById?: string;
}

/** Activity preview for Overview — no search, filters, or pagination. */
export function HistoryTable({
  rows,
  labelledById = "recent-activity-heading",
}: HistoryTableProps) {
  return (
    <EmailActivityTable
      initialRows={rows}
      initialTotal={rows.length}
      paginate={false}
      variant="preview"
      labelledById={labelledById}
    />
  );
}
