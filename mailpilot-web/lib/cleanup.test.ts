import { describe, expect, it } from "vitest";
import {
  groupCleanupCandidates,
  normalizeCleanupAction,
  safetyTierForCategory,
} from "@/lib/cleanup";
import type { ProcessedEmailRow } from "@/lib/emailActivity";

function row(id: number, category: string): ProcessedEmailRow {
  return {
    id,
    gmail_message_id: `msg-${id}`,
    account_id: 1,
    accounts: { email: "chris@example.com" },
    category,
    subject: `Subject ${id}`,
    sender: "Sender <sender@example.com>",
    processed_at: "2026-06-17T12:00:00.000Z",
    message_received_at: "2026-06-17T11:55:00.000Z",
    actions_taken: "Labeled",
    was_archived: false,
    applied_label_names: "[]",
    resolution_status: "unresolved",
    inbox_status: "in_inbox",
  };
}

describe("cleanup grouping", () => {
  it("groups unresolved candidates by safety tier", () => {
    const groups = groupCleanupCandidates([
      row(1, "newsletters"),
      row(2, "work"),
      row(3, "important"),
    ]);

    expect(groups.map((group) => [group.tier, group.candidates.map((c) => c.id)])).toEqual([
      ["safe_auto", [1]],
      ["review", [2]],
      ["never_auto", [3]],
    ]);
  });

  it("falls back unknown categories to review", () => {
    expect(safetyTierForCategory("vendor_notice")).toBe("review");
  });

  it("accepts only manual cleanup actions", () => {
    expect(normalizeCleanupAction("archive")).toBe("archive");
    expect(normalizeCleanupAction("keep")).toBe("keep");
    expect(normalizeCleanupAction("teach")).toBeNull();
  });
});
