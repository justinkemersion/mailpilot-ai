"""Skip accounts with expired/revoked Gmail OAuth while processing others."""

from contextlib import contextmanager
from dataclasses import dataclass
from types import SimpleNamespace

from mailpilot.email_processor import EmailProcessor
from mailpilot.gmail_client import GmailAuthError

from .fakes import InMemoryAccountRepository, InMemoryProcessedEmailRepository


@dataclass
class _Msg:
    id: str
    thread_id: str | None
    subject: str | None
    sender: str | None
    snippet: str | None
    body: str | None
    labels: list[str]


class MixedReauthGmailClient:
    """First account simulates expired OAuth; second account works."""

    def __init__(self) -> None:
        self.worked_accounts: list[str] = []

    def ensure_labels(self, account):
        return {"work": "LBL_WORK", "SPAM": "LBL_SPAM"}

    def list_messages(self, account, label_ids=None, query=None, max_results=100):
        if account.email == "stale@example.com":
            raise GmailAuthError(
                "stale@example.com: Gmail OAuth token could not be refreshed. "
                "Reconnect via the MailPilot web app."
            )
        return ["m-good-1"]

    def get_message(self, account, message_id):
        return _Msg(
            id=message_id,
            thread_id=None,
            subject="Hi",
            sender="friend@example.com",
            snippet="",
            body="",
            labels=["INBOX"],
        )

    def apply_labels(self, account, message_id, labels_to_add=None, labels_to_remove=None):
        self.worked_accounts.append(account.email)

    def archive_message(self, account, message_id) -> None:
        return None

    def flag_important(self, account, message_id) -> None:
        return None


class DummyWorkClassifier:
    def classify(self, subject, sender, body, snippet):
        return SimpleNamespace(category="work", noise_type=None)


def test_skips_stale_oauth_account_and_processes_remaining(monkeypatch):
    acc_repo = InMemoryAccountRepository()
    acc_repo.add(email="stale@example.com", token_json="{}")
    acc_repo.add(email="good@example.com", token_json="{}")
    proc_repo = InMemoryProcessedEmailRepository()

    @contextmanager
    def _ctx():
        yield acc_repo, proc_repo

    monkeypatch.setattr("mailpilot.email_processor.repository_context", _ctx)

    gmail = MixedReauthGmailClient()
    processor = EmailProcessor(
        gmail_client=gmail,
        classifier=DummyWorkClassifier(),
        search_query=None,
    )
    result = processor.process_all_accounts_once()

    assert result.accounts_processed == 2
    assert "stale@example.com" in result.accounts_needing_reauth
    assert "good@example.com" not in result.accounts_needing_reauth
    assert result.processed == 1
    assert gmail.worked_accounts == ["good@example.com"]
