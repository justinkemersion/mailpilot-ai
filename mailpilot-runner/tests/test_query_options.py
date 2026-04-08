from contextlib import contextmanager
from dataclasses import dataclass

import mailpilot.cli as cli_module
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
        self.queries = []

    def ensure_labels(self, account):
        return {}

    def list_messages(self, account, label_ids=None, query=None, max_results=100):
        self.queries.append(query)
        return []

    def get_message(self, account, message_id):
        raise AssertionError("get_message should not be called in this test")

    def apply_labels(self, account, message_id, labels_to_add=None, labels_to_remove=None):
        raise AssertionError("apply_labels should not be called in this test")

    def archive_message(self, account, message_id):
        raise AssertionError("archive_message should not be called in this test")

    def flag_important(self, account, message_id):
        raise AssertionError("flag_important should not be called in this test")


def test_email_processor_uses_custom_search_query(monkeypatch):
    """
    When a custom search_query is provided, EmailProcessor should pass it
    through to GmailClient.list_messages.
    """
    acc_repo = InMemoryAccountRepository()
    acc_repo.add(email="user@example.com", token_json="{}")
    proc_repo = InMemoryProcessedEmailRepository()

    @contextmanager
    def _ctx():
        yield acc_repo, proc_repo

    monkeypatch.setattr("mailpilot.email_processor.repository_context", _ctx)

    gmail = RecordingGmailClient()
    processor = EmailProcessor(
        gmail_client=gmail,
        classifier=DummyClassifier("work"),
        search_query="newer_than:30d",
    )

    processor.process_all_accounts_once()

    assert gmail.queries == ["newer_than:30d"]


def test_cli_passes_raw_query_to_scheduler(monkeypatch):
    """
    Ensure run-once CLI forwards the raw --query argument into the scheduler.
    """
    captured: dict[str, object] = {}

    def fake_run_once(
        *,
        dry_run: bool,
        search_query: str | None,
        user_id: str | None = None,
        run_job_id: int | None = None,
        run_job_repo: object | None = None,
    ):
        captured["dry_run"] = dry_run
        captured["search_query"] = search_query

    monkeypatch.setattr(cli_module, "run_once", fake_run_once)

    cli_module.run_once_command(
        dry_run=True,
        newer_than_days=None,
        include_read=False,
        query="from:boss@example.com newer_than:7d",
    )

    assert captured["dry_run"] is True
    assert captured["search_query"] == "from:boss@example.com newer_than:7d"
