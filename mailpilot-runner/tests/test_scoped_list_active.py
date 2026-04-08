"""Account list_active(user_id) and process_all_accounts_once user scoping."""

from contextlib import contextmanager

from mailpilot.email_processor import EmailProcessor

from .fakes import InMemoryAccountRepository, InMemoryProcessedEmailRepository

_USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
_USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


def test_list_active_filters_by_user_id():
    repo = InMemoryAccountRepository()
    repo.add(email="a@example.com", user_id=_USER_A)
    repo.add(email="b@example.com", user_id=_USER_B)
    assert [a.email for a in repo.list_active(user_id=_USER_A)] == ["a@example.com"]
    assert [a.email for a in repo.list_active(user_id=_USER_B)] == ["b@example.com"]
    assert {a.email for a in repo.list_active()} == {"a@example.com", "b@example.com"}


def test_process_all_accounts_once_respects_user_id(monkeypatch):
    acc_repo = InMemoryAccountRepository()
    acc_repo.add(email="only-a@example.com", user_id=_USER_A)
    acc_repo.add(email="only-b@example.com", user_id=_USER_B)
    proc_repo = InMemoryProcessedEmailRepository()

    @contextmanager
    def _ctx():
        yield acc_repo, proc_repo

    monkeypatch.setattr("mailpilot.email_processor.repository_context", _ctx)

    touched: list[str] = []

    class Gmail:
        def ensure_labels(self, account):
            return {}

        def list_messages(self, account, label_ids=None, query=None, max_results=100):
            touched.append(account.email)
            return []

    processor = EmailProcessor(gmail_client=Gmail(), search_query=None)
    processor.process_all_accounts_once(user_id=_USER_A)

    assert touched == ["only-a@example.com"]
