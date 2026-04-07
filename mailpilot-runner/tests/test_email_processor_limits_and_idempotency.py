from contextlib import contextmanager
from dataclasses import dataclass

from mailpilot.email_processor import EmailProcessor
from mailpilot.models import Account

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
        self.archived = []
        self.applied_labels = []

    def ensure_labels(self, account):
        return {"newsletters": "LBL_NEWS", "spam": "LBL_SPAM"}

    def list_messages(self, account, label_ids=None, query=None, max_results=100):
        return ["m1", "m2", "m3"]

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


def _patch_repos(monkeypatch, acc_repo: InMemoryAccountRepository, proc_repo: InMemoryProcessedEmailRepository):
    @contextmanager
    def _ctx():
        yield acc_repo, proc_repo

    monkeypatch.setattr("mailpilot.email_processor.repository_context", _ctx)


def test_rate_limiting_archives_per_run(monkeypatch):
    """
    Verify that archive actions are capped per run while labels still apply.
    """
    acc_repo = InMemoryAccountRepository()
    acc_repo.add(email="user@example.com", token_json="{}")
    proc_repo = InMemoryProcessedEmailRepository()
    _patch_repos(monkeypatch, acc_repo, proc_repo)

    gmail = RecordingGmailClient()
    processor = EmailProcessor(
        gmail_client=gmail,
        classifier=DummyClassifier("newsletters"),
        max_archives_per_run=2,
        max_spam_marks_per_run=5,
    )

    processor.process_all_accounts_once()

    assert len(gmail.archived) == 2
    labeled_ids = {call["id"] for call in gmail.applied_labels if "LBL_NEWS" in call["add"]}
    assert labeled_ids == {"m1", "m2", "m3"}


def test_rate_limiting_archives_for_many_promotions(monkeypatch):
    """
    Verify that archive actions are capped per run for many promotion emails.
    """
    acc_repo = InMemoryAccountRepository()
    acc_repo.add(email="user@example.com", token_json="{}")
    proc_repo = InMemoryProcessedEmailRepository()
    _patch_repos(monkeypatch, acc_repo, proc_repo)

    class ManyPromotionsGmailClient:
        def __init__(self) -> None:
            self.archived = []
            self.applied_labels = []

        def ensure_labels(self, account):
            return {"promotions": "LBL_PROMO"}

        def list_messages(self, account, label_ids=None, query=None, max_results=100):
            return [f"m{i}" for i in range(100)]

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
                subject="Promo",
                sender="promo@example.com",
                snippet="Snippet",
                body="Body",
                labels=["INBOX"],
            )

        def archive_message(self, account, message_id):
            self.archived.append(message_id)

        def apply_labels(self, account, message_id, labels_to_add=None, labels_to_remove=None):
            self.applied_labels.append(
                {
                    "id": message_id,
                    "add": labels_to_add or [],
                    "remove": labels_to_remove or [],
                }
            )

        def flag_important(self, account, message_id):
            return None

    gmail = ManyPromotionsGmailClient()
    processor = EmailProcessor(
        gmail_client=gmail,
        classifier=DummyClassifier("promotions"),
        max_archives_per_run=30,
        max_spam_marks_per_run=5,
        search_query=None,
    )

    processor.process_all_accounts_once()

    assert len(gmail.archived) == 30
