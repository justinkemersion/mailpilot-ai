from dataclasses import dataclass

import pytest

from mailpilot.gmail_client import ForbiddenGmailActionError, GmailMessage, SafeGmailClient
from mailpilot.models import Account


@dataclass
class DummyAccount:
    id: int
    email: str


class DummyInnerClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple, dict]] = []

    def ensure_labels(self, account: Account):
        self.calls.append(("ensure_labels", (account,), {}))
        return {}

    def list_messages(self, account: Account, label_ids=None, query=None, max_results=100):
        self.calls.append(("list_messages", (account,), {"label_ids": label_ids, "query": query, "max_results": max_results}))
        return []

    def get_message(self, account: Account, message_id: str) -> GmailMessage:
        self.calls.append(("get_message", (account, message_id), {}))
        return GmailMessage(
            id=message_id,
            thread_id=None,
            subject=None,
            sender=None,
            snippet=None,
            body=None,
            labels=[],
        )

    def apply_labels(self, account: Account, message_id: str, labels_to_add=None, labels_to_remove=None):
        self.calls.append(
            ("apply_labels", (account, message_id), {"labels_to_add": labels_to_add, "labels_to_remove": labels_to_remove})
        )

    def archive_message(self, account: Account, message_id: str):
        self.calls.append(("archive_message", (account, message_id), {}))

    def flag_important(self, account: Account, message_id: str):
        self.calls.append(("flag_important", (account, message_id), {}))


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


def test_safe_gmail_client_allows_label_and_archive_operations():
    inner = DummyInnerClient()
    safe = SafeGmailClient(inner)
    account = _dummy_account()

    safe.ensure_labels(account)
    safe.list_messages(account, label_ids=["INBOX"], query="is:unread", max_results=10)
    safe.get_message(account, "msg-1")
    safe.apply_labels(account, "msg-1", labels_to_add=["L1"], labels_to_remove=["INBOX"])
    safe.archive_message(account, "msg-2")
    safe.flag_important(account, "msg-3")

    called_ops = [name for name, _, _ in inner.calls]
    assert called_ops == [
        "ensure_labels",
        "list_messages",
        "get_message",
        "apply_labels",
        "archive_message",
        "flag_important",
    ]


def test_safe_gmail_client_rejects_delete_and_trash_operations():
    inner = DummyInnerClient()
    safe = SafeGmailClient(inner)
    account = _dummy_account()

    with pytest.raises(ForbiddenGmailActionError):
        safe.delete_message(account, "msg-del")

    with pytest.raises(ForbiddenGmailActionError):
        safe.trash_message(account, "msg-trash")

    with pytest.raises(ForbiddenGmailActionError):
        safe.batch_delete_messages(account, ["msg-1", "msg-2"])

