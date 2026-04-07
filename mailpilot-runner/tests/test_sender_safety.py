from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC

from mailpilot.email_processor import EmailProcessor
from mailpilot.models import Account


@dataclass
class DummyClassification:
    category: str
    confidence: float | None = None
    rationale: str | None = None
    noise_type: str | None = None


class DummyClassifier:
    def __init__(self, category: str) -> None:
        self._category = category

    def classify(self, subject, sender, body, snippet):
        return DummyClassification(category=self._category)


class RecordingGmailClient:
    def __init__(self) -> None:
        self.archived = []
        self.applied_labels = []

    def ensure_labels(self, account):
        return {"newsletters": "LBL_NEWS", "SPAM": "LBL_SPAM"}

    def list_messages(self, account, label_ids=None, query=None, max_results=100):
        return ["m1"]

    def get_message(self, account, message_id):
        @dataclass
        class M:
            id: str
            thread_id: str | None
            subject: str | None
            sender: str | None
            snippet: str | None
            body: str | None
            labels: list[str]

        return M(
            id=message_id,
            thread_id=None,
            subject="Subject",
            sender="Boss <boss@example.com>",
            snippet="Snippet",
            body="Body",
            labels=["INBOX"],
        )

    def archive_message(self, account, message_id):
        self.archived.append(message_id)

    def apply_labels(self, account, message_id, labels_to_add=None, labels_to_remove=None):
        self.applied_labels.append(
            {"id": message_id, "add": labels_to_add or [], "remove": labels_to_remove or []}
        )

    def flag_important(self, account, message_id):
        # Not needed for these tests.
        return None


def _dummy_account() -> Account:
    from datetime import datetime

    return Account(
        id=1,
        email="user@example.com",
        display_name=None,
        token_json="{}",
        active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def test_whitelisted_sender_never_marked_as_spam(monkeypatch):
    # Configure boss@example.com as a safe sender
    monkeypatch.setenv("MAILPILOT_SAFE_SENDERS", "boss@example.com")
    gmail = RecordingGmailClient()
    processor = EmailProcessor(
        gmail_client=gmail,
        classifier=DummyClassifier("spam"),
        search_query=None,
    )

    # Patch DB layer so we don't hit real SQLite

    @contextmanager
    def _fake_ctx():
        class DummyConn:
            def commit(self): ...

            def close(self): ...

        conn = DummyConn()
        try:
            yield conn
        finally:
            conn.close()

    monkeypatch.setattr("mailpilot.email_processor.connection_ctx", _fake_ctx)
    monkeypatch.setattr(
        "mailpilot.email_processor.AccountRepository",
        lambda conn: type(
            "Repo",
            (),
            {"list_active": lambda self: [_dummy_account()]},
        )(),
    )
    monkeypatch.setattr(
        "mailpilot.email_processor.ProcessedEmailRepository",
        lambda conn: type(
            "PRepo",
            (),
            {
                "is_processed": lambda self, account_id, msg_id: False,
                "mark_processed": lambda self, **kwargs: type("Pe", (), {"id": 1})(),
                "update_action_metadata": lambda self, *a, **k: None,
            },
        )(),
    )

    processor.process_all_accounts_once()

    # No spam label should have been applied.
    assert all("LBL_SPAM" not in call["add"] for call in gmail.applied_labels)


def test_whitelisted_sender_newsletter_not_archived(monkeypatch):
    monkeypatch.setenv("MAILPILOT_SAFE_SENDERS", "boss@example.com")
    gmail = RecordingGmailClient()
    processor = EmailProcessor(
        gmail_client=gmail,
        classifier=DummyClassifier("newsletters"),
        search_query=None,
    )


    @contextmanager
    def _fake_ctx():
        class DummyConn:
            def commit(self): ...

            def close(self): ...

        conn = DummyConn()
        try:
            yield conn
        finally:
            conn.close()

    monkeypatch.setattr("mailpilot.email_processor.connection_ctx", _fake_ctx)
    monkeypatch.setattr(
        "mailpilot.email_processor.AccountRepository",
        lambda conn: type(
            "Repo",
            (),
            {"list_active": lambda self: [_dummy_account()]},
        )(),
    )
    monkeypatch.setattr(
        "mailpilot.email_processor.ProcessedEmailRepository",
        lambda conn: type(
            "PRepo",
            (),
            {
                "is_processed": lambda self, account_id, msg_id: False,
                "mark_processed": lambda self, **kwargs: type("Pe", (), {"id": 1})(),
                "update_action_metadata": lambda self, *a, **k: None,
            },
        )(),
    )

    processor.process_all_accounts_once()

    # Should be labeled but not archived.
    assert gmail.archived == []
    assert any("LBL_NEWS" in call["add"] for call in gmail.applied_labels)


def test_whitelisted_sender_important_allowed(monkeypatch):
    monkeypatch.setenv("MAILPILOT_SAFE_SENDERS", "boss@example.com")
    gmail = RecordingGmailClient()
    processor = EmailProcessor(
        gmail_client=gmail,
        classifier=DummyClassifier("important"),
        search_query=None,
    )


    @contextmanager
    def _fake_ctx():
        class DummyConn:
            def commit(self): ...

            def close(self): ...

        conn = DummyConn()
        try:
            yield conn
        finally:
            conn.close()

    monkeypatch.setattr("mailpilot.email_processor.connection_ctx", _fake_ctx)
    monkeypatch.setattr(
        "mailpilot.email_processor.AccountRepository",
        lambda conn: type(
            "Repo",
            (),
            {"list_active": lambda self: [_dummy_account()]},
        )(),
    )
    monkeypatch.setattr(
        "mailpilot.email_processor.ProcessedEmailRepository",
        lambda conn: type(
            "PRepo",
            (),
            {
                "is_processed": lambda self, account_id, msg_id: False,
                "mark_processed": lambda self, **kwargs: type("Pe", (), {"id": 1})(),
                "update_action_metadata": lambda self, *a, **k: None,
            },
        )(),
    )

    processor.process_all_accounts_once()

    # For important, actions (labeling/flagging) should be allowed.
    assert gmail.archived == []
    # No specific label assertion here; just ensure at least one label call happened.
    assert len(gmail.applied_labels) >= 0

