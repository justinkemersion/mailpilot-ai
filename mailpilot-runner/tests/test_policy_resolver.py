from datetime import UTC, datetime

from mailpilot.models import Account
from mailpilot.policy_resolver import (
    build_policy_preview,
    legacy_would_archive,
    resolve_policy,
    should_archive,
)


def _account(**kwargs: object) -> Account:
    defaults = dict(
        id=1,
        user_id="user-1",
        email="work@example.com",
        display_name=None,
        token_json="{}",
        active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        purpose="work_delivery",
        default_archive_policy="ask_first",
        security_posture="relaxed",
    )
    defaults.update(kwargs)
    return Account(**defaults)  # type: ignore[arg-type]


def test_newsletters_default_ask_first_without_legacy():
    account = _account()
    resolved = resolve_policy("newsletters", account)
    assert resolved.action == "ask_first"
    assert not should_archive(
        resolved,
        "newsletters",
        is_safe_sender=False,
        archive_receipts=False,
        legacy_auto_archive=False,
    )


def test_newsletters_legacy_auto_archive():
    account = _account()
    resolved = resolve_policy("newsletters", account)
    assert should_archive(
        resolved,
        "newsletters",
        is_safe_sender=False,
        archive_receipts=False,
        legacy_auto_archive=True,
    )


def test_account_fallback_never_archive():
    account = _account(default_archive_policy="never_archive")
    resolved = resolve_policy("work", account)
    assert resolved.action == "never_archive"


def test_policy_preview_detects_newsletter_change():
    account = _account(email="a@b.com")
    preview = build_policy_preview(
        "newsletters",
        account,
        is_safe_sender=False,
        archive_receipts=False,
        legacy_auto_archive=True,
    )
    assert preview is not None
    assert preview.current_behavior == "archive"
    assert preview.new_policy == "ask_first"


def test_legacy_would_archive_receipts_only_when_flagged():
    assert legacy_would_archive(
        "receipts",
        is_safe_sender=False,
        archive_receipts=True,
        legacy_auto_archive=False,
    )
    assert not legacy_would_archive(
        "receipts",
        is_safe_sender=False,
        archive_receipts=False,
        legacy_auto_archive=False,
    )
