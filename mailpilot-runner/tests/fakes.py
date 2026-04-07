"""
In-memory persistence fakes for unit tests (replaces former SQLite :memory: usage).
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any, Iterator

from mailpilot.models import Account, ProcessedEmail

_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"


class InMemoryAccountRepository:
    def __init__(self) -> None:
        self._accounts: dict[int, Account] = {}
        self._next_id = 1

    def add(
        self,
        *,
        email: str,
        token_json: str = "{}",
        display_name: str | None = None,
        user_id: str = _FAKE_USER_ID,
    ) -> Account:
        now = datetime.now(UTC)
        aid = self._next_id
        self._next_id += 1
        acc = Account(
            id=aid,
            user_id=user_id,
            email=email,
            display_name=display_name,
            token_json=token_json,
            active=True,
            created_at=now,
            updated_at=now,
        )
        self._accounts[aid] = acc
        return acc

    def get_by_id(self, account_id: int) -> Account | None:
        return self._accounts.get(account_id)

    def get_by_email(self, email: str) -> Account | None:
        for a in self._accounts.values():
            if a.email == email and a.active:
                return a
        return None

    def update_token(self, account_id: int, token_json: str) -> None:
        a = self._accounts.get(account_id)
        if a:
            self._accounts[account_id] = Account(
                id=a.id,
                user_id=a.user_id,
                email=a.email,
                display_name=a.display_name,
                token_json=token_json,
                active=a.active,
                created_at=a.created_at,
                updated_at=datetime.now(UTC),
            )

    def list_active(self) -> list[Account]:
        return sorted(
            (a for a in self._accounts.values() if a.active),
            key=lambda x: x.email,
        )


class InMemoryProcessedEmailRepository:
    def __init__(self, user_id: str = _FAKE_USER_ID) -> None:
        self._user_id = user_id
        self._rows: dict[tuple[int, str], ProcessedEmail] = {}
        self._by_id: dict[int, ProcessedEmail] = {}
        self._next_id = 1

    def is_processed(self, account_id: int, gmail_message_id: str) -> bool:
        return (account_id, gmail_message_id) in self._rows

    def mark_processed(
        self,
        *,
        user_id: str,
        account_id: int,
        gmail_message_id: str,
        category: str,
        subject: str | None,
        gmail_thread_id: str | None,
        raw_labels: str | None,
        sender: str | None = None,
        actions_taken: str | None = None,
        was_archived: bool = False,
        applied_label_names: str | None = None,
        message_received_at: datetime | None = None,
    ) -> ProcessedEmail:
        key = (account_id, gmail_message_id)
        if key in self._rows:
            return self._rows[key]
        now = datetime.now(UTC)
        pid = self._next_id
        self._next_id += 1
        pe = ProcessedEmail(
            id=pid,
            user_id=user_id,
            account_id=account_id,
            gmail_message_id=gmail_message_id,
            gmail_thread_id=gmail_thread_id,
            category=category,
            subject=subject,
            processed_at=now,
            message_received_at=message_received_at,
            raw_labels=raw_labels,
            sender=sender,
            actions_taken=actions_taken,
            was_archived=was_archived,
            applied_label_names=applied_label_names,
        )
        self._rows[key] = pe
        self._by_id[pid] = pe
        return pe

    def update_action_metadata(
        self,
        processed_email_id: int,
        actions_taken: str,
        was_archived: bool,
        applied_label_names: str | None,
    ) -> None:
        pe = self._by_id.get(processed_email_id)
        if not pe:
            return
        key = (pe.account_id, pe.gmail_message_id)
        updated = ProcessedEmail(
            id=pe.id,
            user_id=pe.user_id,
            account_id=pe.account_id,
            gmail_message_id=pe.gmail_message_id,
            gmail_thread_id=pe.gmail_thread_id,
            category=pe.category,
            subject=pe.subject,
            processed_at=pe.processed_at,
            message_received_at=pe.message_received_at,
            raw_labels=pe.raw_labels,
            sender=pe.sender,
            actions_taken=actions_taken,
            was_archived=was_archived,
            applied_label_names=applied_label_names,
        )
        self._rows[key] = updated
        self._by_id[processed_email_id] = updated

    def mark_undone(self, processed_email_id: int) -> None:
        pe = self._by_id.get(processed_email_id)
        if not pe:
            return
        new_actions = (pe.actions_taken or "").strip() + " [UNDONE]"
        self.update_action_metadata(processed_email_id, new_actions.strip(), pe.was_archived, pe.applied_label_names)

    def search_history(self, **kwargs: Any) -> list[dict[str, Any]]:
        return []

    def summarize_recent(self, limit: int = 20) -> list[dict[str, Any]]:
        return []

    def stored_keys(self) -> list[tuple[int, str]]:
        """Test helper: (account_id, gmail_message_id) pairs."""
        return list(self._rows.keys())


@contextmanager
def fake_repository_context(
    accounts: InMemoryAccountRepository | None = None,
    processed: InMemoryProcessedEmailRepository | None = None,
) -> Iterator[tuple[InMemoryAccountRepository, InMemoryProcessedEmailRepository]]:
    ar = accounts or InMemoryAccountRepository()
    pr = processed or InMemoryProcessedEmailRepository()
    yield ar, pr
