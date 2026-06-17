"""Match account-scoped user preferences against message fields."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class MailPreference:
    id: int
    user_id: str
    account_id: int
    match_type: str
    match_conditions_json: dict[str, Any]
    category_id: int | None
    action_policy: str
    enabled: bool


def _normalize(value: str | None) -> str:
    return (value or "").strip().lower()


def _sender_address(sender: str | None) -> str | None:
    if not sender:
        return None
    text = sender.strip()
    angle = re.match(r"^.+?<([^>]+)>", text)
    if angle:
        return angle.group(1).strip().lower()
    if "@" in text:
        return text.lower()
    return None


def _sender_domain(sender: str | None) -> str | None:
    address = _sender_address(sender)
    if not address or "@" not in address:
        return None
    return address.split("@", 1)[1].lower()


def _subject_matches(subject: str | None, phrases: list[str]) -> bool:
    haystack = _normalize(subject)
    if not haystack:
        return False
    return all(_normalize(phrase) in haystack for phrase in phrases if phrase.strip())


def preference_matches_message(
    preference: MailPreference,
    *,
    category: str,
    subject: str | None,
    sender: str | None,
) -> bool:
    if not preference.enabled:
        return False

    conditions = preference.match_conditions_json or {}
    match_type = preference.match_type

    if match_type == "category":
        slug = conditions.get("category_slug") or conditions.get("category")
        return slug == category

    if match_type == "sender":
        expected = _normalize(conditions.get("sender"))
        return bool(expected) and _sender_address(sender) == expected

    if match_type == "sender_domain":
        expected = _normalize(conditions.get("sender_domain"))
        return bool(expected) and _sender_domain(sender) == expected

    if match_type == "subject_pattern":
        pattern = conditions.get("subject_pattern") or conditions.get("pattern")
        if not pattern or not subject:
            return False
        return re.search(str(pattern), subject, re.IGNORECASE) is not None

    if match_type == "composite":
        slug = conditions.get("category_slug")
        if slug and slug != category:
            return False
        domain = conditions.get("sender_domain")
        if domain and _sender_domain(sender) != _normalize(domain):
            return False
        expected_sender = conditions.get("sender")
        if expected_sender and _sender_address(sender) != _normalize(expected_sender):
            return False
        phrases = conditions.get("subject_contains")
        if isinstance(phrases, list) and phrases and not _subject_matches(subject, phrases):
            return False
        pattern = conditions.get("subject_pattern")
        if pattern and subject and re.search(str(pattern), subject, re.IGNORECASE) is None:
            return False
        return True

    return False


def find_matching_preference(
    preferences: list[MailPreference],
    *,
    category: str,
    subject: str | None,
    sender: str | None,
) -> MailPreference | None:
    """Return the first enabled preference that matches (account list pre-filtered)."""
    for pref in preferences:
        if preference_matches_message(
            pref, category=category, subject=subject, sender=sender
        ):
            return pref
    return None
