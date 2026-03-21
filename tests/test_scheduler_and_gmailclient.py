import types

from mailpilot.gmail_client import GmailClient, GmailMessage
from mailpilot.models import Account
from mailpilot.scheduler import run_once


def _dummy_account() -> Account:
    from datetime import datetime, timezone

    return Account(
        id=1,
        email="user@example.com",
        display_name=None,
        token_json="{}",
        active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


def test_gmail_client_label_mapping_ensure_labels(monkeypatch):
    """
    Verify that ensure_labels caches label name -> id mapping
    without hitting real Gmail.
    """

    class DummyLabels:
        def list(self, userId):
            class Call:
                def execute(self_inner):
                    return {"labels": [{"id": "LBL1", "name": "work"}]}

            return Call()

        def create(self, userId, body):
            class Call:
                def execute(self_inner):
                    return {"id": f"LBL_{body['name']}", "name": body["name"]}

            return Call()

    class DummyService:
        def users(self):
            return self

        def labels(self):
            return DummyLabels()

    class DummyCreds:
        def to_json(self):
            return "{}"

    def dummy_build(*args, **kwargs):
        return DummyService(), DummyCreds()

    monkeypatch.setattr("mailpilot.gmail_client._build_service", dummy_build)

    client = GmailClient()
    account = _dummy_account()
    mapping = client.ensure_labels(account)

    # At least the required labels should be present
    assert "work" in mapping
    assert "mailpilot/important" in mapping


def test_scheduler_run_once_uses_email_processor(monkeypatch):
    """
    Ensure run_once delegates to EmailProcessor without raising.
    """

    calls = {"count": 0}

    class DummyProcessor:
        def process_all_accounts_once(self_inner):
            calls["count"] += 1

    monkeypatch.setattr(
        "mailpilot.scheduler.EmailProcessor",
        lambda: DummyProcessor(),  # type: ignore[assignment]
    )

    run_once()

    assert calls["count"] == 1

