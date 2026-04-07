from contextlib import contextmanager
from dataclasses import dataclass

from mailpilot.email_processor import EmailProcessor

from .fakes import InMemoryAccountRepository, InMemoryProcessedEmailRepository


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
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def ensure_labels(self, account):
        self.calls.append(("ensure_labels", account.email))
        return {}

    def list_messages(self, account, label_ids=None, query=None, max_results=100):
        self.calls.append(("list_messages", account.email))
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


def test_multi_account_processed_ids_are_isolated(monkeypatch):
    """
    Same Gmail message id in two different accounts must be tracked separately.
    """
    acc_repo = InMemoryAccountRepository()
    acc_repo.add(email="account_a@example.com", token_json="{}")
    acc_repo.add(email="account_b@example.com", token_json="{}")
    proc_repo = InMemoryProcessedEmailRepository()

    @contextmanager
    def _ctx():
        yield acc_repo, proc_repo

    monkeypatch.setattr("mailpilot.email_processor.repository_context", _ctx)

    gmail = RecordingGmailClient()
    processor = EmailProcessor(
        gmail_client=gmail,
        classifier=DummyClassifier("work"),
        search_query=None,
    )

    processor.process_all_accounts_once()

    keys = [k for k in proc_repo.stored_keys() if k[1] == "shared-msg-id"]
    assert len(keys) == 2
    assert {k[0] for k in keys} == {1, 2}

    accounts_seen = {email for op, email in gmail.calls if op.startswith("list_messages")}
    assert {"account_a@example.com", "account_b@example.com"}.issubset(accounts_seen)
