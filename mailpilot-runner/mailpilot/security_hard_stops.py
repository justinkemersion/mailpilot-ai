"""Tier-3 hard-stop patterns that block archive even when a preference matches."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class HardStopMatch:
    block_reason: str
    summary: str


_PATTERNS: list[tuple[tuple[str, ...], str, str]] = [
    (
        ("password changed", "password reset", "password was changed", "reset your password"),
        "hard_stop_password_changed",
        "Hard stop: message mentions password change or reset.",
    ),
    (
        ("recovery", "account recovery", "recover your account"),
        "hard_stop_recovery_changed",
        "Hard stop: message mentions account recovery.",
    ),
    (
        ("suspicious activity", "unusual activity", "unrecognized activity"),
        "hard_stop_suspicious_activity",
        "Hard stop: message mentions suspicious account activity.",
    ),
    (
        ("account disabled", "account suspended", "account locked"),
        "hard_stop_account_disabled",
        "Hard stop: message mentions account access restriction.",
    ),
    (
        ("payment failed", "payment overdue", "past due", "declined payment"),
        "hard_stop_payment_failed",
        "Hard stop: message mentions failed or overdue payment.",
    ),
]


def _haystack(subject: str | None, sender: str | None) -> str:
    parts = [subject or "", sender or ""]
    return " ".join(parts).lower()


def check_hard_stop(subject: str | None, sender: str | None) -> HardStopMatch | None:
    text = _haystack(subject, sender)
    if not text.strip():
        return None

    for phrases, reason, summary in _PATTERNS:
        if any(phrase in text for phrase in phrases):
            return HardStopMatch(block_reason=reason, summary=summary)

    subj = (subject or "").strip()
    if subj.lower().startswith("re:") or subj.lower().startswith("fwd:"):
        return HardStopMatch(
            block_reason="hard_stop_human_reply",
            summary="Hard stop: subject looks like a human thread reply.",
        )

    if re.search(r"\burgent\b|\basap\b|\bimmediately\b", text):
        return HardStopMatch(
            block_reason="hard_stop_urgency",
            summary="Hard stop: urgency language detected.",
        )

    return None
