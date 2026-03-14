from dataclasses import dataclass

import pytest

from mailpilot.ai_classifier import ClassificationError
from mailpilot.email_processor import EmailProcessor
from mailpilot.models import Account


@dataclass
class DummyClassification:
    category: str
    noise_type: str | None = None


class FailingClassifier:
    def classify(self, subject, sender, body, snippet):
        raise ClassificationError("simulated failure")


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
            sender="sender@example.com",
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
        return None


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


def test_classification_failure_skips_actions(monkeypatch):
    """
    If classification fails, the message should be skipped (no labels or archives).
    """
    from mailpilot import database

    # Use in-memory DB and seed one account.
    monkeypatch.setenv("MAILPILOT_DB_PATH", ":memory:")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    with database.connection_ctx() as conn:
        acct_repo = database.AccountRepository(conn)
        acct_repo.add_or_update("user@example.com", "{}", None)

    gmail = RecordingGmailClient()
    processor = EmailProcessor(
        gmail_client=gmail,
        classifier=FailingClassifier(),
        search_query=None,
    )

    processor.process_all_accounts_once()

    # No archive or label operations should have been attempted.
    assert gmail.archived == []
    assert gmail.applied_labels == []

