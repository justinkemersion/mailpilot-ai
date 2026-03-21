import sqlite3
from pathlib import Path

from typer.testing import CliRunner

from mailpilot.database import (
    AccountRepository,
    ProcessedEmailRepository,
    check_database_at_path,
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


def test_check_database_at_path_healthy_empty_file(tmp_path):
    db_file = tmp_path / "mailpilot.db"
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    _init_schema(conn)
    conn.close()

    report = check_database_at_path(db_file)
    assert report.ok
    assert report.integrity == "ok"
    assert report.foreign_key_violation_count == 0
    assert report.active_accounts == 0
    assert report.processed_emails_total == 0
    assert report.account_summaries == []


def test_check_database_at_path_missing_file(tmp_path):
    report = check_database_at_path(tmp_path / "missing.db")
    assert not report.ok
    assert any("does not exist" in m for m in report.messages)


def test_check_database_at_path_rejects_memory():
    report = check_database_at_path(Path(":memory:"))
    assert not report.ok
    assert any("on-disk" in m for m in report.messages)


def test_check_database_at_path_multi_account_counts(tmp_path):
    db_file = tmp_path / "mailpilot.db"
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    _init_schema(conn)
    account_repo = AccountRepository(conn)
    processed_repo = ProcessedEmailRepository(conn)
    a1 = account_repo.add_or_update("a1@example.com", "{}", None)
    a2 = account_repo.add_or_update("a2@example.com", "{}", None)
    processed_repo.mark_processed(a1.id, "gmsg-1", "work", "S1", "t1", None)
    processed_repo.mark_processed(a1.id, "gmsg-2", "personal", "S2", "t2", None)
    processed_repo.mark_processed(a2.id, "gmsg-1", "work", "S3", "t3", None)
    conn.close()

    report = check_database_at_path(db_file)
    assert report.ok
    assert report.active_accounts == 2
    assert report.processed_emails_total == 3
    by_email = {email: n for _, email, n in report.account_summaries}
    assert by_email["a1@example.com"] == 2
    assert by_email["a2@example.com"] == 1


def test_db_check_cli_ok(tmp_path, monkeypatch):
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "1")
    db_file = tmp_path / "mailpilot.db"
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    _init_schema(conn)
    conn.close()
    monkeypatch.setenv("MAILPILOT_DB_PATH", str(db_file))

    from mailpilot.cli import app

    runner = CliRunner()
    result = runner.invoke(app, ["db-check"])
    assert result.exit_code == 0, result.stdout + result.stderr
    assert "db-check: OK" in result.stdout
    assert "Integrity: ok" in result.stdout


def test_db_check_cli_fails_missing_file(tmp_path, monkeypatch):
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "1")
    monkeypatch.setenv("MAILPILOT_DB_PATH", str(tmp_path / "nope.db"))

    from mailpilot.cli import app

    runner = CliRunner()
    result = runner.invoke(app, ["db-check"])
    assert result.exit_code == 1
    assert "db-check: FAILED" in result.stdout

