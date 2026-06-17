"""Resolve inbox action policy from category, account scope, and legacy behavior."""

from __future__ import annotations

from dataclasses import dataclass

from .category_seeds import SEED_BY_SLUG, CategorySeed
from .models import Account


@dataclass(frozen=True)
class PolicyPreview:
    category: str
    current_behavior: str
    new_policy: str
    reason: str
    account_email: str

    def as_dict(self) -> dict[str, str]:
        return {
            "category": self.category,
            "current_behavior": self.current_behavior,
            "new_policy": self.new_policy,
            "reason": self.reason,
            "account_email": self.account_email,
        }


@dataclass(frozen=True)
class ResolvedPolicy:
    action: str
    safety_tier: str
    reason: str
    label_name: str | None


def _seed_for(category: str) -> CategorySeed:
    return SEED_BY_SLUG.get(category) or CategorySeed(
        category,
        category.replace("_", " ").title(),
        category,
        "keep_inbox",
        "review",
    )


def legacy_behavior_label(
    category: str,
    *,
    is_safe_sender: bool,
    archive_receipts: bool,
    legacy_auto_archive: bool,
) -> str:
    """Human-readable legacy archive outcome (pre–PolicyResolver matrix)."""
    if category in ("newsletters", "promotions"):
        if is_safe_sender:
            return "keep_inbox (safe sender)"
        if legacy_auto_archive:
            return "archive"
        return "keep_inbox (legacy auto-archive off)"
    if category == "receipts":
        if archive_receipts and not is_safe_sender:
            return "archive"
        return "keep_inbox"
    if category == "spam":
        return "never_archive"
    return "keep_inbox"


def legacy_would_archive(
    category: str,
    *,
    is_safe_sender: bool,
    archive_receipts: bool,
    legacy_auto_archive: bool,
) -> bool:
    label = legacy_behavior_label(
        category,
        is_safe_sender=is_safe_sender,
        archive_receipts=archive_receipts,
        legacy_auto_archive=legacy_auto_archive,
    )
    return label == "archive"


def resolve_policy(
    category: str,
    account: Account,
    *,
    matched_preference: object | None = None,
    hard_stop: object | None = None,
) -> ResolvedPolicy:
    seed = _seed_for(category)
    action = seed.default_action
    reason = f"{seed.safety_tier} tier default for {seed.slug}"

    if action in ("keep_inbox", "ask_first", "never_archive"):
        fallback = account.default_archive_policy
        if action == "keep_inbox" and fallback == "never_archive":
            action = "never_archive"
            reason = f"account resolution posture is {fallback}"
        elif action == "ask_first" and fallback == "keep_inbox":
            action = "keep_inbox"
            reason = f"account resolution posture is {fallback}"

    pref_action = getattr(matched_preference, "action_policy", None)
    pref_id = getattr(matched_preference, "id", None)
    if pref_action:
        action = str(pref_action)
        reason = f"matched user preference {pref_id}"

    if hard_stop is not None:
        if pref_action == "archive" or action == "archive":
            reason = getattr(hard_stop, "summary", "Hard stop prevented archive")
        action = "never_archive"

    # Account-level archive is never allowed as fallback.
    if action == "archive" and not pref_action:
        action = "ask_first"
        reason = "archive requires category override or user preference (not account fallback)"

    return ResolvedPolicy(
        action=action,
        safety_tier=seed.safety_tier,
        reason=reason,
        label_name=seed.label_name if seed.label_name != "SPAM" else "SPAM",
    )


def should_archive(
    resolved: ResolvedPolicy,
    category: str,
    *,
    matched_preference: object | None = None,
    is_safe_sender: bool,
    archive_receipts: bool,
    legacy_auto_archive: bool,
) -> bool:
    """Whether to remove INBOX for this message on this run."""
    if resolved.action == "never_archive":
        return False
    if legacy_auto_archive and legacy_would_archive(
        category,
        is_safe_sender=is_safe_sender,
        archive_receipts=archive_receipts,
        legacy_auto_archive=True,
    ):
        return True
    if resolved.action == "archive":
        pref_action = getattr(matched_preference, "action_policy", None)
        pref_id = getattr(matched_preference, "id", None)
        return pref_action == "archive" and pref_id is not None
    return False


def resolution_status_for(
    resolved: ResolvedPolicy,
    *,
    was_archived: bool,
    archive_blocked: bool = False,
) -> str:
    if was_archived:
        return "archived"
    if archive_blocked:
        return "blocked"
    if resolved.action in ("ask_first", "nudge"):
        return "unresolved"
    if resolved.action == "never_archive":
        return "needs_attention"
    return "kept"


def build_policy_preview(
    category: str,
    account: Account,
    *,
    is_safe_sender: bool,
    archive_receipts: bool,
    legacy_auto_archive: bool,
) -> PolicyPreview | None:
    resolved = resolve_policy(category, account)
    current = legacy_behavior_label(
        category,
        is_safe_sender=is_safe_sender,
        archive_receipts=archive_receipts,
        legacy_auto_archive=legacy_auto_archive,
    )
    new_label = resolved.action
    if current == new_label:
        return None
    return PolicyPreview(
        category=category,
        current_behavior=current,
        new_policy=new_label,
        reason=resolved.reason,
        account_email=account.email,
    )
