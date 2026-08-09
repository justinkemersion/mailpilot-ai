from datetime import UTC, datetime
from unittest.mock import MagicMock

from mailpilot.action_logger import ActionLogRepository, ProcessedEmailLogContext
from mailpilot.models import Account
from mailpilot.policy_resolver import resolve_policy, should_archive
from mailpilot.preference_matcher import MailPreference, find_matching_preference
from mailpilot.security_hard_stops import check_hard_stop


def _account(**kwargs: object) -> Account:
    defaults = dict(
        id=1,
        user_id="user-a",
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


def _pref(
    *,
    pref_id: int,
    account_id: int,
    user_id: str = "user-a",
    action_policy: str = "archive",
    conditions: dict | None = None,
) -> MailPreference:
    return MailPreference(
        id=pref_id,
        user_id=user_id,
        account_id=account_id,
        match_type="composite",
        match_conditions_json=conditions
        or {
            "sender_domain": "accounts.google.com",
            "subject_contains": ["sign-in"],
            "category_slug": "work_device_sign_in",
        },
        category_id=None,
        action_policy=action_policy,
        enabled=True,
    )


def test_policy_resolver_scoped_preference():
    account_a = _account(id=1, user_id="user-a", email="a@example.com")
    account_b = _account(id=2, user_id="user-b", email="b@example.com")
    pref_a = _pref(pref_id=10, account_id=1, user_id="user-a")

    resolved_a = resolve_policy(
        "work_device_sign_in", account_a, matched_preference=pref_a
    )
    resolved_b = resolve_policy("work_device_sign_in", account_b)

    assert resolved_a.action == "archive"
    assert resolved_b.action == "ask_first"


def test_hard_stops_prevent_archive():
    account = _account()
    pref = _pref(pref_id=5, account_id=1)
    hard_stop = check_hard_stop(
        "Password changed on your Google Account",
        "Google <no-reply@accounts.google.com>",
    )
    assert hard_stop is not None

    resolved = resolve_policy(
        "work_device_sign_in",
        account,
        matched_preference=pref,
        hard_stop=hard_stop,
    )
    assert resolved.action == "never_archive"
    assert not should_archive(
        resolved,
        "work_device_sign_in",
        is_safe_sender=False,
        archive_receipts=False,
        legacy_auto_archive=False,
    )


def test_archive_blocked_logged():
    account = _account()
    pref = _pref(pref_id=7, account_id=1)
    hard_stop = check_hard_stop(
        "Password changed on your Google Account",
        "Google <no-reply@accounts.google.com>",
    )
    assert hard_stop is not None

    client = MagicMock()
    repo = ActionLogRepository(client)
    repo.log_archive_blocked(
        account=account,
        context=ProcessedEmailLogContext(
            processed_email_id=99,
            gmail_message_id="msg-99",
            gmail_thread_id="thread-99",
            category_id=None,
            resolution_status="unresolved",
            inbox_status="in_inbox",
            was_archived=False,
            actions_taken=None,
            proposed_action=None,
            subject="Password changed on your Google Account",
            sender="Google <no-reply@accounts.google.com>",
        ),
        preference=pref,
        hard_stop=hard_stop,
        category="work_device_sign_in",
    )

    client.table.assert_called_once_with("mail_action_log")
    row = client.table.return_value.insert.call_args[0][0]
    assert row["action_taken"] == "archive_blocked"
    assert row["preference_id"] == 7
    assert row["reason_json"]["block_reason"] == "hard_stop_password_changed"


def test_preference_matcher_isolated_by_account_fields():
    pref_a = _pref(pref_id=1, account_id=1)
    pref_b = _pref(
        pref_id=2,
        account_id=2,
        user_id="user-b",
        conditions={
            "sender_domain": "other.example.com",
            "subject_contains": ["invoice"],
            "category_slug": "receipts",
        },
    )
    matched = find_matching_preference(
        [pref_a, pref_b],
        category="work_device_sign_in",
        subject="New sign-in from Gmail",
        sender="Google <no-reply@accounts.google.com>",
    )
    assert matched is not None
    assert matched.id == 1

    no_match = find_matching_preference(
        [pref_b],
        category="work_device_sign_in",
        subject="New sign-in from Gmail",
        sender="Google <no-reply@accounts.google.com>",
    )
    assert no_match is None


def test_work_device_sign_in_preference_auto_archive():
    from mailpilot.email_processor import EmailProcessor
    from tests.test_email_processor import DummyGmailClient, _dummy_account

    dummy_gmail = DummyGmailClient()
    processor = EmailProcessor(gmail_client=dummy_gmail)
    account = _dummy_account()
    pref = _pref(pref_id=9, account_id=account.id)
    resolved = resolve_policy(
        "work_device_sign_in", account, matched_preference=pref
    )
    log_context = ProcessedEmailLogContext(
        processed_email_id=1,
        gmail_message_id="msg-signin",
        gmail_thread_id=None,
        category_id=None,
        resolution_status="unresolved",
        inbox_status="in_inbox",
        was_archived=False,
        actions_taken=None,
        proposed_action=None,
        subject="New sign-in from Gmail",
        sender="Google <no-reply@accounts.google.com>",
    )

    class OkLogger:
        def __init__(self) -> None:
            self.rows: list[dict] = []

        def try_log_auto_archive(self, **kwargs):  # type: ignore[no-untyped-def]
            self.rows.append(kwargs)
            return True

    logger = OkLogger()
    summary = processor._apply_actions(  # type: ignore[attr-defined]
        account=account,
        msg_id="msg-signin",
        labels_map={"security/work-device-sign-in": "LBL_SIGNIN"},
        category="work_device_sign_in",
        is_safe_sender=False,
        resolved=resolved,
        matched_preference=pref,
        action_log_repo=logger,
        log_context=log_context,
    )

    assert dummy_gmail.archived == [(account.email, "msg-signin")]
    assert summary.was_archived is True
    assert len(logger.rows) == 1


def test_action_log_required_before_auto_archive():
    from mailpilot.email_processor import EmailProcessor
    from tests.test_email_processor import DummyGmailClient, _dummy_account

    dummy_gmail = DummyGmailClient()
    processor = EmailProcessor(gmail_client=dummy_gmail)
    account = _dummy_account()
    pref = _pref(pref_id=12, account_id=account.id)
    resolved = resolve_policy("newsletters", account, matched_preference=pref)
    log_context = ProcessedEmailLogContext(
        processed_email_id=2,
        gmail_message_id="msg-news",
        gmail_thread_id=None,
        category_id=None,
        resolution_status="unresolved",
        inbox_status="in_inbox",
        was_archived=False,
        actions_taken=None,
        proposed_action=None,
        subject="Weekly digest",
        sender="news@example.com",
    )

    class FailLogger:
        def try_log_auto_archive(self, **kwargs):  # type: ignore[no-untyped-def]
            return False

    processor._apply_actions(  # type: ignore[attr-defined]
        account=account,
        msg_id="msg-news",
        labels_map={"newsletters": "LBL_NEWS"},
        category="newsletters",
        is_safe_sender=False,
        resolved=resolved,
        matched_preference=pref,
        action_log_repo=FailLogger(),
        log_context=log_context,
    )

    assert dummy_gmail.archived == []
