import pytest
from googleapiclient.errors import HttpError
from httplib2 import Response

from mailpilot.gmail_client import GmailApiError, GmailClient
from mailpilot.models import Account
from mailpilot.scheduler import run_forever, run_once


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


def _http_error() -> HttpError:
    return HttpError(Response({"status": "500"}), b'{"error":"simulated"}')


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


def test_gmail_client_list_messages_raises_gmail_api_error(monkeypatch):
    class FailingMessages:
        def list(self, **kwargs):
            class Call:
                def execute(self_inner):
                    raise _http_error()

            return Call()

    class DummyService:
        def users(self):
            return self

        def messages(self):
            return FailingMessages()

    class DummyCreds:
        def to_json(self):
            return "{}"

    monkeypatch.setattr("mailpilot.gmail_client._build_service", lambda *args, **kwargs: (DummyService(), DummyCreds()))
    client = GmailClient()

    with pytest.raises(GmailApiError):
        client.list_messages(_dummy_account())


def test_gmail_client_get_message_raises_gmail_api_error(monkeypatch):
    class FailingMessages:
        def get(self, **kwargs):
            class Call:
                def execute(self_inner):
                    raise _http_error()

            return Call()

    class DummyService:
        def users(self):
            return self

        def messages(self):
            return FailingMessages()

    class DummyCreds:
        def to_json(self):
            return "{}"

    monkeypatch.setattr("mailpilot.gmail_client._build_service", lambda *args, **kwargs: (DummyService(), DummyCreds()))
    client = GmailClient()

    with pytest.raises(GmailApiError):
        client.get_message(_dummy_account(), "msg-1")


def test_headers_from_payload_finds_from_on_nested_parts():
    from mailpilot.gmail_client import _headers_from_payload

    payload = {
        "mimeType": "multipart/alternative",
        "parts": [
            {
                "mimeType": "text/plain",
                "headers": [
                    {"name": "From", "value": "Bob <bob@example.com>"},
                    {"name": "Subject", "value": "Hello"},
                ],
            }
        ],
    }
    headers = _headers_from_payload(payload)
    assert headers["from"] == "Bob <bob@example.com>"
    assert headers["subject"] == "Hello"


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


def test_scheduler_run_forever_reraises_unexpected_errors(monkeypatch):
    monkeypatch.setattr("mailpilot.scheduler.signal.signal", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        "mailpilot.scheduler.run_once",
        lambda dry_run=False, search_query=None: (_ for _ in ()).throw(ValueError("unexpected")),
    )

    with pytest.raises(ValueError):
        run_forever(interval_seconds=1)

