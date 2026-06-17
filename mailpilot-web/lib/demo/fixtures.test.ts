import { describe, expect, it } from "vitest";
import {
  DEMO_PROCESSED_EMAILS,
  getDemoDashboardMetrics,
  getDemoEmailActivityPage,
} from "@/lib/demo/fixtures";

describe("demo fixtures", () => {
  it("returns Chris sample metrics", () => {
    const metrics = getDemoDashboardMetrics();
    expect(metrics.total_processed).toBe(DEMO_PROCESSED_EMAILS.length);
    expect(metrics.total_processed).toBeGreaterThanOrEqual(25);
    expect(metrics.active_accounts).toBe(2);
    expect(metrics.by_category.important).toBeGreaterThan(0);
  });

  it("paginates activity emails", () => {
    const page = getDemoEmailActivityPage({ offset: 0, limit: 10 });
    expect(page.rows).toHaveLength(10);
    expect(page.total).toBe(DEMO_PROCESSED_EMAILS.length);
  });

  it("filters activity by category", () => {
    const page = getDemoEmailActivityPage({ category: "receipts" });
    expect(page.rows.every((r) => r.category === "receipts")).toBe(true);
    expect(page.total).toBeGreaterThan(0);
  });

  it("sorts activity by mailbox email ascending", () => {
    const page = getDemoEmailActivityPage({ sort: "account_asc", limit: 100 });
    const emails = page.rows.map((row) => row.accounts?.email ?? "");
    const sorted = [...emails].sort((a, b) => a.localeCompare(b));
    expect(emails).toEqual(sorted);
  });
});
