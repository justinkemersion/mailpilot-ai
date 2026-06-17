"""System category seeds for Phase 9 policy resolution (mirrors mail_categories DDL)."""

from __future__ import annotations

from dataclasses import dataclass

ActionPolicy = str  # keep_inbox | archive | ask_first | nudge | never_archive
SafetyTier = str  # safe_auto | review | never_auto


@dataclass(frozen=True)
class CategorySeed:
    slug: str
    name: str
    label_name: str
    default_action: ActionPolicy
    safety_tier: SafetyTier


SYSTEM_CATEGORY_SEEDS: tuple[CategorySeed, ...] = (
    CategorySeed("important", "Important", "mailpilot/important", "keep_inbox", "never_auto"),
    CategorySeed("work", "Work", "work", "keep_inbox", "review"),
    CategorySeed("personal", "Personal", "personal", "keep_inbox", "review"),
    CategorySeed("newsletters", "Newsletters", "newsletters", "ask_first", "safe_auto"),
    CategorySeed("promotions", "Promotions", "promotions", "ask_first", "safe_auto"),
    CategorySeed("receipts", "Receipts", "receipts", "ask_first", "safe_auto"),
    CategorySeed("spam", "Spam", "SPAM", "never_archive", "never_auto"),
    CategorySeed(
        "work_device_sign_in",
        "Work device sign-in",
        "security/work-device-sign-in",
        "ask_first",
        "review",
    ),
)

SEED_BY_SLUG: dict[str, CategorySeed] = {s.slug: s for s in SYSTEM_CATEGORY_SEEDS}
