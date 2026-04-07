from dataclasses import dataclass

from mailpilot.email_processor import EmailProcessor
from mailpilot.models import Account


@dataclass
class DummyClassification:
    category: str
    noise_type: str | None = None


class DummyClassifier:
    def __init__(self, category: str) -> None:
        self._category = category

    def classify(self, subject, sender, body, snippet):
        return DummyClassification(category=self._category)


class RecordingGmailClient:
    """
    Records per-account Gmail operations to verify isolation.
    """

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []  # (operation, account_email)

    def ensure_labels(self, account):
        self.calls.append(("ensure_labels", account.email))
        return {}

    def list_messages(self, account, label_ids=None, query=None, max_results=100):
        self.calls.append(("list_messages", account.email))
        # Return a single shared message id for all accounts to test isolation.
        return ["shared-msg-id"]

    def get_message(self, account, message_id):
        self.calls.append(("get_message", account.email))

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

    def apply_labels(self, account, message_id, labels_to_add=None, labels_to_remove=None):
        self.calls.append(("apply_labels", account.email))

    def archive_message(self, account, message_id):
        self.calls.append(("archive_message", account.email))

    def flag_important(self, account, message_id):
        self.calls.append(("flag_important", account.email))


def _dummy_accounts():
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    return (
        Account(
            id=1,
            email="account_a@example.com",
            display_name=None,
            token_json="{}",
            active=True,
            created_at=now,
            updated_at=now,
        ),
        Account(
            id=2,
            email="account_b@example.com",
            display_name=None,
            token_json="{}",
            active=True,
            created_at=now,
            updated_at=now,
        ),
    )


def test_multi_account_processed_ids_are_isolated(monkeypatch):
    """
    Same Gmail message id in two different accounts must be tracked separately.
    """
    # Ensure we use an in-memory DB
    monkeypatch.setenv("MAILPILOT_DB_PATH", ":memory:")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    from mailpilot import database

    # Prepare two accounts in the real repositories.
    with database.connection_ctx() as conn:
        acct_repo = database.AccountRepository(conn)
        acct_repo.add_or_update("account_a@example.com", "{}", None)
        acct_repo.add_or_update("account_b@example.com", "{}", None)

    gmail = RecordingGmailClient()
    processor = EmailProcessor(
        gmail_client=gmail,
        classifier=DummyClassifier("work"),
        search_query=None,
    )

    # Run once over all accounts.
    processor.process_all_accounts_once()

    # Verify processed_emails contains one row per (account, message id) for the
    # shared message id used in this test and limited to the two accounts we created.
    with database.connection_ctx() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT pe.account_id, pe.gmail_message_id
            FROM processed_emails pe
            JOIN accounts a ON pe.account_id = a.id
            WHERE pe.gmail_message_id = ?
              AND a.email IN ('account_a@example.com', 'account_b@example.com')
            """,
            ("shared-msg-id",),
        )
        rows = cur.fetchall()

        # Expect exactly two rows with the same gmail_message_id but different account_id.
        assert len(rows) == 2
        account_ids = {row["account_id"] for row in rows}
        assert len(account_ids) == 2

    # Ensure Gmail operations were invoked for each of our test accounts independently.
    accounts_seen = {email for op, email in gmail.calls if op.startswith("list_messages")}
    assert {"account_a@example.com", "account_b@example.com"}.issubset(accounts_seen)

