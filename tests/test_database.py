import sqlite3

from mailpilot.database import (
    AccountRepository,
    ProcessedEmailRepository,
    _init_schema,  # type: ignore[attr-defined]
)


def _fresh_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    _init_schema(conn)
    return conn


def test_account_repository_add_and_get():
    conn = _fresh_conn()
    repo = AccountRepository(conn)

    email = "test@example.com"
    token = '{"access_token": "x"}'

    account = repo.add_or_update(email=email, token_json=token, display_name="Test User")
    assert account.email == email

    fetched = repo.get_by_email(email)
    assert fetched is not None
    assert fetched.email == email


def test_processed_email_repository_idempotent():
    conn = _fresh_conn()
    account_repo = AccountRepository(conn)
    processed_repo = ProcessedEmailRepository(conn)

    account = account_repo.add_or_update(
        email="test@example.com", token_json="{}", display_name=None
    )

    msg_id = "msg-1"
    assert not processed_repo.is_processed(account.id, msg_id)

    first = processed_repo.mark_processed(
        account_id=account.id,
        gmail_message_id=msg_id,
        category="work",
        subject="Subject",
        gmail_thread_id="thread-1",
        raw_labels="INBOX",
    )
    assert processed_repo.is_processed(account.id, msg_id)

    second = processed_repo.mark_processed(
        account_id=account.id,
        gmail_message_id=msg_id,
        category="work",
        subject="Subject",
        gmail_thread_id="thread-1",
        raw_labels="INBOX",
    )

    # Unique constraint + INSERT OR IGNORE should keep one row only
    assert first.id == second.id

