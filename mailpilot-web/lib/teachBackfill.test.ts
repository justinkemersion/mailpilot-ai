import { describe, expect, it } from "vitest";
import {
  buildTeachScanMeta,
  filterTeachBackfillMatches,
  TEACH_BACKFILL_SCAN_LIMIT,
  teachConfirmBodyCopy,
  type TeachBackfillEmailRow,
} from "@/lib/teachBackfill";

const preference = {
  enabled: true,
  match_type: "composite" as const,
  match_conditions_json: {
    category_slug: "newsletters",
    sender_domain: "news.example.com",
  },
};

function row(partial: Partial<TeachBackfillEmailRow> & { id: number }): TeachBackfillEmailRow {
  return {
    id: partial.id,
    account_id: 1,
    category: partial.category ?? "newsletters",
    subject: partial.subject ?? "Weekly news",
    sender: partial.sender ?? "News <hello@news.example.com>",
    resolution_status: partial.resolution_status ?? "unresolved",
    proposed_action: partial.proposed_action ?? null,
    inbox_status: partial.inbox_status ?? "in_inbox",
    was_archived: partial.was_archived ?? false,
    actions_taken: partial.actions_taken ?? null,
    taught_preference_id: partial.taught_preference_id ?? null,
  };
}

describe("buildTeachScanMeta", () => {
  it("marks truncated false when pool is within scan limit", () => {
    const meta = buildTeachScanMeta({
      matchCount: 3,
      scannedCount: 120,
      totalCandidateCount: 120,
    });
    expect(meta.truncated).toBe(false);
    expect(meta.scanned_count).toBe(120);
    expect(meta.scan_limit).toBe(TEACH_BACKFILL_SCAN_LIMIT);
    expect(meta.total_candidate_count).toBe(120);
  });

  it("marks truncated true when pool exceeds scan limit", () => {
    const meta = buildTeachScanMeta({
      matchCount: 12,
      scannedCount: TEACH_BACKFILL_SCAN_LIMIT,
      totalCandidateCount: 900,
    });
    expect(meta.truncated).toBe(true);
    expect(meta.scanned_count).toBe(500);
    expect(meta.total_candidate_count).toBe(900);
  });

  it("uses optimistic truncation when total count is unavailable", () => {
    const meta = buildTeachScanMeta({
      matchCount: 40,
      scannedCount: TEACH_BACKFILL_SCAN_LIMIT,
    });
    expect(meta.truncated).toBe(true);
    expect(meta.total_candidate_count).toBeUndefined();
  });
});

describe("teachConfirmBodyCopy", () => {
  it("uses normal copy when not truncated", () => {
    const copy = teachConfirmBodyCopy(
      buildTeachScanMeta({ matchCount: 2, scannedCount: 50, totalCandidateCount: 50 })
    );
    expect(copy).toBe("This will mark 2 similar messages in this mailbox.");
  });

  it("uses truncated copy with scanned and scan_limit", () => {
    const copy = teachConfirmBodyCopy(
      buildTeachScanMeta({
        matchCount: 8,
        scannedCount: 500,
        totalCandidateCount: 1200,
      })
    );
    expect(copy).toContain("scanned the first 500 candidate messages");
    expect(copy).toContain("limit 500");
    expect(copy).toContain("8 matches");
    expect(copy).toContain("More older matching messages may exist");
  });
});

describe("filterTeachBackfillMatches", () => {
  it("skips rows tied to a different taught preference", () => {
    const scanned = [
      row({ id: 1 }),
      row({ id: 2, taught_preference_id: 99 }),
    ];
    const matches = filterTeachBackfillMatches(scanned, preference, "never_archive", {
      preferenceId: 10,
    });
    expect(matches.map((m) => m.id)).toEqual([1]);
  });

  it("excludes non-matching rows without forced ids", () => {
    const scanned = [
      row({ id: 2, category: "receipts", sender: "Other <x@other.com>" }),
    ];
    const matches = filterTeachBackfillMatches(scanned, preference, "never_archive");
    expect(matches).toHaveLength(0);
  });
});
