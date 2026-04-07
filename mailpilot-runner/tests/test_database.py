import sqlite3
from pathlib import Path

from typer.testing import CliRunner

from mailpilot.database import (
    AccountRepository,
    ProcessedEmailRepository,
    _init_schema,  # type: ignore[attr-defined]
    _processed_emails_existing_columns,  # type: ignore[attr-defined]
    check_database_at_path,
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


def test_processed_emails_migration_adds_columns(tmp_path, monkeypatch):
    db_file = tmp_path / "legacy.db"
    conn = sqlite3.connect(db_file)
    conn.executescript(
        """
        CREATE TABLE accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT,
            token_json TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE processed_emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            gmail_message_id TEXT NOT NULL,
            gmail_thread_id TEXT,
            category TEXT NOT NULL,
            subject TEXT,
            processed_at TEXT NOT NULL,
            raw_labels TEXT,
            FOREIGN KEY(account_id) REFERENCES accounts(id),
            UNIQUE(account_id, gmail_message_id)
        );
        """
    )
    conn.commit()
    conn.close()

    conn2 = sqlite3.connect(db_file)
    conn2.row_factory = sqlite3.Row
    conn2.execute("PRAGMA foreign_keys=ON")
    _init_schema(conn2)
    conn2.close()

    conn3 = sqlite3.connect(db_file)
    cols = _processed_emails_existing_columns(conn3)
    conn3.close()
    assert {"sender", "actions_taken", "was_archived", "applied_label_names"}.issubset(cols)


def test_search_history_and_mark_undone():
    conn = _fresh_conn()
    account_repo = AccountRepository(conn)
    processed_repo = ProcessedEmailRepository(conn)
    account = account_repo.add_or_update("hist@example.com", "{}", None)
    pe = processed_repo.mark_processed(
        account.id,
        "gmsg-h1",
        "newsletters",
        "Weekly",
        "th1",
        None,
        sender="news@example.com",
    )
    processed_repo.update_action_metadata(
        pe.id,
        "Archived; Labeled: newsletters",
        True,
        '["newsletters"]',
    )
    rows = processed_repo.search_history(
        sender="news@",
        category="newsletters",
        days_back=7,
        action="Archived",
        limit=10,
    )
    assert len(rows) == 1
    assert rows[0]["gmail_message_id"] == "gmsg-h1"
    processed_repo.mark_undone(pe.id)
    cur = conn.execute(
        "SELECT actions_taken FROM processed_emails WHERE id = ?",
        (pe.id,),
    )
    assert "[UNDONE]" in cur.fetchone()[0]


def test_db_check_cli_fails_missing_file(tmp_path, monkeypatch):
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "1")
    monkeypatch.setenv("MAILPILOT_DB_PATH", str(tmp_path / "nope.db"))

    from mailpilot.cli import app

    runner = CliRunner()
    result = runner.invoke(app, ["db-check"])
    assert result.exit_code == 1
    assert "db-check: FAILED" in result.stdout

