from contextlib import contextmanager
from dataclasses import dataclass

from mailpilot.email_processor import EmailProcessor

from .fakes import InMemoryAccountRepository, InMemoryProcessedEmailRepository


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
        return {
            "newsletters": "LBL_NEWS",
            "SPAM": "LBL_SPAM",
            "IMPORTANT": "LBL_IMPORTANT",
            "mailpilot/important": "LBL_MP_IMP",
        }

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
        return None


def _patch_ctx(monkeypatch, acc_repo, proc_repo):
    @contextmanager
    def _ctx():
        yield acc_repo, proc_repo

    monkeypatch.setattr("mailpilot.email_processor.repository_context", _ctx)


def test_whitelisted_sender_never_marked_as_spam(monkeypatch):
    monkeypatch.setenv("MAILPILOT_SAFE_SENDERS", "boss@example.com")
    acc_repo = InMemoryAccountRepository()
    acc_repo.add(email="user@example.com", token_json="{}")
    proc_repo = InMemoryProcessedEmailRepository()
    _patch_ctx(monkeypatch, acc_repo, proc_repo)

    gmail = RecordingGmailClient()
    processor = EmailProcessor(
        gmail_client=gmail,
        classifier=DummyClassifier("spam"),
        search_query=None,
    )

    processor.process_all_accounts_once()

    assert all("LBL_SPAM" not in call["add"] for call in gmail.applied_labels)


def test_whitelisted_sender_newsletter_not_archived(monkeypatch):
    monkeypatch.setenv("MAILPILOT_SAFE_SENDERS", "boss@example.com")
    acc_repo = InMemoryAccountRepository()
    acc_repo.add(email="user@example.com", token_json="{}")
    proc_repo = InMemoryProcessedEmailRepository()
    _patch_ctx(monkeypatch, acc_repo, proc_repo)

    gmail = RecordingGmailClient()
    processor = EmailProcessor(
        gmail_client=gmail,
        classifier=DummyClassifier("newsletters"),
        search_query=None,
    )

    processor.process_all_accounts_once()

    assert gmail.archived == []
    assert any("LBL_NEWS" in call["add"] for call in gmail.applied_labels)


def test_whitelisted_sender_important_allowed(monkeypatch):
    monkeypatch.setenv("MAILPILOT_SAFE_SENDERS", "boss@example.com")
    acc_repo = InMemoryAccountRepository()
    acc_repo.add(email="user@example.com", token_json="{}")
    proc_repo = InMemoryProcessedEmailRepository()
    _patch_ctx(monkeypatch, acc_repo, proc_repo)

    gmail = RecordingGmailClient()
    processor = EmailProcessor(
        gmail_client=gmail,
        classifier=DummyClassifier("important"),
        search_query=None,
    )

    processor.process_all_accounts_once()

    assert gmail.applied_labels
