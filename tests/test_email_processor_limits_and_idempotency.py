from dataclasses import dataclass

from mailpilot.email_processor import EmailProcessor
from mailpilot.models import Account


@dataclass
class DummyClassification:
    category: str


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
        return {"newsletters": "LBL_NEWS", "spam": "LBL_SPAM"}

    def list_messages(self, account, label_ids=None, query=None, max_results=100):
        return ["m1", "m2", "m3"]

    def get_message(self, account, message_id):
        # Minimal object with required attributes
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

    # Unused but required by EmailProcessor in other paths
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


def test_rate_limiting_archives_per_run(monkeypatch):
    """
    Verify that archive actions are capped per run while labels still apply.
    """
    from mailpilot import database

    # Force an in-memory DB for this test
    monkeypatch.setenv("MAILPILOT_DB_PATH", ":memory:")

    # Patch connection_ctx to use the in-memory DB consistently
    def _conn_ctx():
        conn = database.get_connection()
        try:
            yield conn
        finally:
            conn.close()

    monkeypatch.setattr("mailpilot.email_processor.connection_ctx", database.connection_ctx)

    gmail = RecordingGmailClient()
    processor = EmailProcessor(
        gmail_client=gmail,
        classifier=DummyClassifier("newsletters"),
        max_archives_per_run=2,
        max_spam_marks_per_run=5,
    )

    # Ensure there is one active account
    with database.connection_ctx() as conn:
        from mailpilot.database import AccountRepository

        repo = AccountRepository(conn)
        repo.add_or_update("user@example.com", "{}", "User")

    processor.process_all_accounts_once()

    # Only 2 messages should be archived despite 3 candidates
    assert len(gmail.archived) == 2
    # But all 3 should have received the newsletters label
    labeled_ids = {call["id"] for call in gmail.applied_labels if "LBL_NEWS" in call["add"]}
    assert labeled_ids == {"m1", "m2", "m3"}


