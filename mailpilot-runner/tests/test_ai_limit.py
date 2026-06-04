from contextlib import contextmanager
from dataclasses import dataclass

import pytest
from types import SimpleNamespace

from mailpilot.ai_classifier import (
    AiLimitExceededError,
    OpenAIClassifier,
    ai_limit_user_message,
)
from mailpilot.email_processor import EmailProcessor


class DummyRateLimitError(Exception):
    def __init__(self) -> None:
        super().__init__("429 Too Many Requests")
        self.status_code = 429
        self.response = SimpleNamespace(headers={})


class AlwaysRateLimitedClient:
    def __init__(self) -> None:
        self.calls = 0
        self.responses = self

    def create(self, **kwargs):
        self.calls += 1
        raise DummyRateLimitError()


class LimitHitClassifier:
    def __init__(self) -> None:
        self.calls = 0

    def classify(self, subject, sender, body, snippet):
        self.calls += 1
        raise AiLimitExceededError(
            ai_limit_user_message("openai"), provider="openai"
        )


def test_openai_raises_ai_limit_after_retries_exhausted(monkeypatch):
    monkeypatch.setenv("MAILPILOT_OPENAI_MAX_RETRIES", "1")
    monkeypatch.setenv("MAILPILOT_OPENAI_RETRY_BASE_MS", "1")
    monkeypatch.setenv("MAILPILOT_CLASSIFICATION_DELAY_MS", "0")
    monkeypatch.setattr("mailpilot.ai_classifier.time.sleep", lambda _: None)

    classifier = OpenAIClassifier(client=AlwaysRateLimitedClient())

    with pytest.raises(AiLimitExceededError) as exc_info:
        classifier.classify(
            subject="Hello",
            sender="person@example.com",
            body="Body",
            snippet="Snippet",
        )

    assert exc_info.value.provider == "openai"
    assert "OpenAI" in str(exc_info.value)


def _patch_repos(monkeypatch, acc_repo, proc_repo):
    @contextmanager
    def _ctx():
        yield acc_repo, proc_repo

    monkeypatch.setattr("mailpilot.email_processor.repository_context", _ctx)


def test_processor_records_ai_limit_and_skips_remaining_llm_calls(monkeypatch):
    from .fakes import InMemoryAccountRepository, InMemoryProcessedEmailRepository

    acc_repo = InMemoryAccountRepository()
    acc_repo.add(email="user@example.com", token_json="{}")
    proc_repo = InMemoryProcessedEmailRepository()
    _patch_repos(monkeypatch, acc_repo, proc_repo)

    class MultiMessageGmailClient:
        def ensure_labels(self, account):
            return {"personal": "LBL_PERSONAL"}

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
                subject=f"Subject {message_id}",
                sender="person@example.com",
                snippet="Checking in",
                body="Can we chat?",
                labels=["INBOX"],
            )

        def apply_labels(self, account, message_id, labels_to_add=None, labels_to_remove=None):
            return None

        def archive_message(self, account, message_id):
            return None

        def flag_important(self, account, message_id):
            return None

    classifier = LimitHitClassifier()
    processor = EmailProcessor(
        gmail_client=MultiMessageGmailClient(),
        classifier=classifier,
    )

    result = processor.process_all_accounts_once()

    assert result.ai_limit_hit is True
    assert result.ai_limit_message is not None
    assert "OpenAI" in result.ai_limit_message
    assert result.llm_calls == 0
    assert result.skipped_by_ai_limit == 1
    assert classifier.calls == 1
