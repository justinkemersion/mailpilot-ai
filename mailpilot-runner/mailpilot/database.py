from __future__ import annotations

import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .config import load_config
from .models import Account, ProcessedEmail

_PROJECT_ROOT = Path(__file__).resolve().parent.parent

_IN_MEMORY_CONN: sqlite3.Connection | None = None


@dataclass(frozen=True)
class DbCheckReport:
    """Result of a read-only database health / multi-account consistency check."""

    ok: bool
    db_path_display: str
    integrity: str
    foreign_key_violation_count: int
    active_accounts: int
    processed_emails_total: int
    account_summaries: list[tuple[int, str, int]]  # account id, email, processed count
    orphan_processed_count: int
    duplicate_key_groups: int
    cross_account_message_id_count: int
    messages: list[str]


def resolve_database_file_path() -> Path:
    """
    Path to the on-disk SQLite database file.

    Does not call load_config(), so OPENAI_API_KEY is not required. Loads `.env`
    when present (unless PYTEST_CURRENT_TEST is set) so MAILPILOT_DB_PATH applies.
    """
    from dotenv import load_dotenv

    if not os.getenv("PYTEST_CURRENT_TEST"):
        env_file = _PROJECT_ROOT / ".env"
        if env_file.exists():
            load_dotenv(env_file)

    raw = os.getenv("MAILPILOT_DB_PATH")
    if raw == ":memory:":
        return Path(":memory:")
    if raw:
        return Path(raw).expanduser().resolve()
    return (_PROJECT_ROOT / "data" / "mailpilot.db").resolve()


def check_database_at_path(path: Path) -> DbCheckReport:
    """
    Open the database read-only and verify integrity, foreign keys, and
    multi-account isolation invariants.
    """
    messages: list[str] = []
    if str(path) == ":memory:":
        return DbCheckReport(
            ok=False,
            db_path_display=":memory:",
            integrity="skipped",
            foreign_key_violation_count=0,
            active_accounts=0,
            processed_emails_total=0,
            account_summaries=[],
            orphan_processed_count=0,
            duplicate_key_groups=0,
            cross_account_message_id_count=0,
            messages=["db-check only supports on-disk database files, not :memory:."],
        )

    resolved = path.expanduser().resolve()
    display = str(resolved)

    if not resolved.exists():
        return DbCheckReport(
            ok=False,
            db_path_display=display,
            integrity="skipped",
            foreign_key_violation_count=0,
            active_accounts=0,
            processed_emails_total=0,
            account_summaries=[],
            orphan_processed_count=0,
            duplicate_key_groups=0,
            cross_account_message_id_count=0,
            messages=[f"Database file does not exist: {display}"],
        )

    uri = f"file:{resolved.as_posix()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            """
            SELECT name FROM sqlite_master
            WHERE type='table' AND name IN ('accounts', 'processed_emails')
            """
        )
        found_tables = {r[0] for r in cur.fetchall()}
        if found_tables != {"accounts", "processed_emails"}:
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            tables = [r[0] for r in cur.fetchall()]
            return DbCheckReport(
                ok=False,
                db_path_display=display,
                integrity="skipped",
                foreign_key_violation_count=0,
                active_accounts=0,
                processed_emails_total=0,
                account_summaries=[],
                orphan_processed_count=0,
                duplicate_key_groups=0,
                cross_account_message_id_count=0,
                messages=[
                    f"MailPilot tables not found (expected accounts, processed_emails). "
                    f"Found tables: {tables or '(none)'}"
                ],
            )

        integrity_row = cur.execute("PRAGMA integrity_check").fetchone()
        integrity = integrity_row[0] if integrity_row else "unknown"

        fk_rows = list(cur.execute("PRAGMA foreign_key_check"))
        fk_count = len(fk_rows)

        cur.execute(
            """
            SELECT COUNT(*) FROM processed_emails pe
            LEFT JOIN accounts a ON a.id = pe.account_id
            WHERE a.id IS NULL
            """
        )
        orphan_count = int(cur.fetchone()[0])

        cur.execute(
            """
            SELECT COUNT(*) FROM (
                SELECT account_id, gmail_message_id
                FROM processed_emails
                GROUP BY account_id, gmail_message_id
                HAVING COUNT(*) > 1
            )
            """
        )
        dup_groups = int(cur.fetchone()[0])

        cur.execute(
            """
            SELECT COUNT(*) FROM (
                SELECT gmail_message_id
                FROM processed_emails
                GROUP BY gmail_message_id
                HAVING COUNT(DISTINCT account_id) > 1
            )
            """
        )
        cross_account = int(cur.fetchone()[0])

        cur.execute(
            """
            SELECT a.id, a.email, COUNT(pe.id) AS n
            FROM accounts a
            LEFT JOIN processed_emails pe ON pe.account_id = a.id
            WHERE a.active = 1
            GROUP BY a.id, a.email
            ORDER BY a.email
            """
        )
        summaries: list[tuple[int, str, int]] = [
            (int(r["id"]), str(r["email"]), int(r["n"])) for r in cur.fetchall()
        ]

        cur.execute("SELECT COUNT(*) FROM processed_emails")
        processed_total = int(cur.fetchone()[0])

        cur.execute("SELECT COUNT(*) FROM accounts WHERE active = 1")
        active_n = int(cur.fetchone()[0])

        if integrity != "ok":
            messages.append(f"Integrity check failed: {integrity}")
        if fk_count:
            messages.append(f"Foreign key violations: {fk_count} row(s) reported by PRAGMA foreign_key_check")
        if orphan_count:
            messages.append(f"Orphan processed_emails rows (missing account): {orphan_count}")
        if dup_groups:
            messages.append(f"Duplicate (account_id, gmail_message_id) groups: {dup_groups}")
        if cross_account:
            messages.append(
                f"Note: {cross_account} Gmail message id(s) appear under more than one account "
                "(unusual; verify if unexpected)."
            )

        ok = integrity == "ok" and fk_count == 0 and orphan_count == 0 and dup_groups == 0

        return DbCheckReport(
            ok=ok,
            db_path_display=display,
            integrity=integrity,
            foreign_key_violation_count=fk_count,
            active_accounts=active_n,
            processed_emails_total=processed_total,
            account_summaries=summaries,
            orphan_processed_count=orphan_count,
            duplicate_key_groups=dup_groups,
            cross_account_message_id_count=cross_account,
            messages=messages,
        )
    finally:
        conn.close()


def _get_db_path() -> Path:
    """
    Determine the database path.

    Special-case MAILPILOT_DB_PATH == ':memory:' so tests can use an
    in-memory database without requiring other config like OPENAI_API_KEY.
    """
    env_db = os.getenv("MAILPILOT_DB_PATH")
    if env_db == ":memory:":
        return Path(":memory:")
    return load_config().db_path


def get_connection() -> sqlite3.Connection:
    """
    Get a SQLite connection, ensuring the schema exists.
    """
    db_path = _get_db_path()
    # Special handling for in-memory DB used in tests
    global _IN_MEMORY_CONN
    if str(db_path) == ":memory:":
        if _IN_MEMORY_CONN is None:
            _IN_MEMORY_CONN = sqlite3.connect(":memory:")
            _IN_MEMORY_CONN.row_factory = sqlite3.Row
            _IN_MEMORY_CONN.execute("PRAGMA foreign_keys=ON")
            _init_schema(_IN_MEMORY_CONN)
        return _IN_MEMORY_CONN

    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    _init_schema(conn)
    return conn


@contextmanager
def connection_ctx() -> Iterator[sqlite3.Connection]:
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        if conn is not _IN_MEMORY_CONN:
            conn.close()


def _init_schema(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT,
            token_json TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS processed_emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            gmail_message_id TEXT NOT NULL,
            gmail_thread_id TEXT,
            category TEXT NOT NULL,
            subject TEXT,
            processed_at TEXT NOT NULL,
            raw_labels TEXT,
            sender TEXT,
            actions_taken TEXT,
            was_archived INTEGER NOT NULL DEFAULT 0,
            applied_label_names TEXT,
            FOREIGN KEY(account_id) REFERENCES accounts(id),
            UNIQUE(account_id, gmail_message_id)
        );
        """
    )
    conn.commit()
    _ensure_processed_emails_columns(conn)


def _processed_emails_existing_columns(conn: sqlite3.Connection) -> set[str]:
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(processed_emails)")
    return {str(row[1]) for row in cur.fetchall()}


def _ensure_processed_emails_columns(conn: sqlite3.Connection) -> None:
    """Add columns introduced after v0.1 for existing SQLite files."""
    existing = _processed_emails_existing_columns(conn)
    if not existing:
        return
    alters: list[str] = []
    if "sender" not in existing:
        alters.append("ALTER TABLE processed_emails ADD COLUMN sender TEXT")
    if "actions_taken" not in existing:
        alters.append("ALTER TABLE processed_emails ADD COLUMN actions_taken TEXT")
    if "was_archived" not in existing:
        alters.append(
            "ALTER TABLE processed_emails ADD COLUMN was_archived INTEGER NOT NULL DEFAULT 0"
        )
    if "applied_label_names" not in existing:
        alters.append("ALTER TABLE processed_emails ADD COLUMN applied_label_names TEXT")
    if not alters:
        return
    cur = conn.cursor()
    for stmt in alters:
        cur.execute(stmt)
    conn.commit()


class AccountRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def add_or_update(self, email: str, token_json: str, display_name: str | None) -> Account:
        now = datetime.now(UTC).isoformat()
        cur = self._conn.cursor()
        cur.execute(
            """
            INSERT INTO accounts (email, display_name, token_json, active, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
                display_name=excluded.display_name,
                token_json=excluded.token_json,
                active=1,
                updated_at=excluded.updated_at
            """,
            (email, display_name, token_json, now, now),
        )
        self._conn.commit()
        account = self.get_by_email(email)
        if account is None:
            raise RuntimeError(f"Account row missing after upsert for {email!r}")
        return account

    def get_by_id(self, account_id: int) -> Account | None:
        cur = self._conn.cursor()
        cur.execute("SELECT * FROM accounts WHERE id = ?", (account_id,))
        row = cur.fetchone()
        return self._row_to_account(row) if row else None

    def get_by_email(self, email: str) -> Account | None:
        cur = self._conn.cursor()
        cur.execute("SELECT * FROM accounts WHERE email = ? AND active = 1", (email,))
        row = cur.fetchone()
        return self._row_to_account(row) if row else None

    def update_token(self, account_id: int, token_json: str) -> None:
        now = datetime.now(UTC).isoformat()
        cur = self._conn.cursor()
        cur.execute(
            "UPDATE accounts SET token_json = ?, updated_at = ? WHERE id = ?",
            (token_json, now, account_id),
        )
        self._conn.commit()

    def list_active(self) -> list[Account]:
        cur = self._conn.cursor()
        cur.execute("SELECT * FROM accounts WHERE active = 1 ORDER BY email")
        return [self._row_to_account(r) for r in cur.fetchall()]

    @staticmethod
    def _row_to_account(row: sqlite3.Row) -> Account:
        return Account(
            id=row["id"],
            email=row["email"],
            display_name=row["display_name"],
            token_json=row["token_json"],
            active=bool(row["active"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )


class ProcessedEmailRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def is_processed(self, account_id: int, gmail_message_id: str) -> bool:
        cur = self._conn.cursor()
        cur.execute(
            """
            SELECT 1 FROM processed_emails
            WHERE account_id = ? AND gmail_message_id = ?
            """,
            (account_id, gmail_message_id),
        )
        return cur.fetchone() is not None

    def mark_processed(
        self,
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
    ) -> ProcessedEmail:
        now = datetime.now(UTC).isoformat()
        cur = self._conn.cursor()
        cur.execute(
            """
            INSERT OR IGNORE INTO processed_emails
            (account_id, gmail_message_id, gmail_thread_id, category, subject, processed_at, raw_labels,
             sender, actions_taken, was_archived, applied_label_names)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                account_id,
                gmail_message_id,
                gmail_thread_id,
                category,
                subject,
                now,
                raw_labels,
                sender,
                actions_taken,
                1 if was_archived else 0,
                applied_label_names,
            ),
        )
        self._conn.commit()

        cur.execute(
            "SELECT * FROM processed_emails WHERE account_id = ? AND gmail_message_id = ?",
            (account_id, gmail_message_id),
        )
        row = cur.fetchone()
        return self._row_to_processed(row)

    def update_action_metadata(
        self,
        processed_email_id: int,
        actions_taken: str,
        was_archived: bool,
        applied_label_names: str | None,
    ) -> None:
        cur = self._conn.cursor()
        cur.execute(
            """
            UPDATE processed_emails
            SET actions_taken = ?, was_archived = ?, applied_label_names = ?
            WHERE id = ?
            """,
            (actions_taken, 1 if was_archived else 0, applied_label_names, processed_email_id),
        )
        self._conn.commit()

    def mark_undone(self, processed_email_id: int) -> None:
        cur = self._conn.cursor()
        cur.execute(
            """
            UPDATE processed_emails
            SET actions_taken = TRIM(COALESCE(actions_taken, '') || ' [UNDONE]')
            WHERE id = ?
            """,
            (processed_email_id,),
        )
        self._conn.commit()

    def search_history(
        self,
        *,
        sender: str | None = None,
        subject: str | None = None,
        category: str | None = None,
        days_back: int = 7,
        action: str | None = None,
        limit: int = 50,
        message_id: str | None = None,
        account_email: str | None = None,
    ) -> list[dict[str, Any]]:
        cutoff = (datetime.now(UTC) - timedelta(days=days_back)).isoformat()
        clauses: list[str] = ["pe.processed_at >= ?"]
        params: list[Any] = [cutoff]

        if sender is not None:
            clauses.append("pe.sender LIKE ?")
            params.append(f"%{sender}%")
        if subject is not None:
            clauses.append("pe.subject LIKE ?")
            params.append(f"%{subject}%")
        if category is not None:
            clauses.append("pe.category = ?")
            params.append(category)
        if action is not None:
            clauses.append("pe.actions_taken LIKE ?")
            params.append(f"%{action}%")
        if message_id is not None:
            clauses.append("pe.gmail_message_id = ?")
            params.append(message_id)
        if account_email is not None:
            clauses.append("a.email = ?")
            params.append(account_email)

        where_sql = " AND ".join(clauses)
        params.append(limit)
        cur = self._conn.cursor()
        cur.execute(
            f"""
            SELECT pe.id,
                   pe.account_id,
                   pe.gmail_message_id,
                   pe.category,
                   pe.subject,
                   pe.processed_at,
                   pe.sender,
                   pe.actions_taken,
                   pe.was_archived,
                   pe.applied_label_names,
                   a.email AS account_email
            FROM processed_emails pe
            JOIN accounts a ON a.id = pe.account_id
            WHERE {where_sql}
            ORDER BY pe.processed_at DESC
            LIMIT ?
            """,
            params,
        )
        return [dict(r) for r in cur.fetchall()]

    def summarize_recent(self, limit: int = 20) -> list[dict[str, Any]]:
        cur = self._conn.cursor()
        cur.execute(
            """
            SELECT pe.processed_at,
                   pe.category,
                   pe.subject,
                   a.email as account_email
            FROM processed_emails pe
            JOIN accounts a ON pe.account_id = a.id
            ORDER BY pe.processed_at DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cur.fetchall()
        return [dict(row) for row in rows]

    @staticmethod
    def _row_to_processed(row: sqlite3.Row) -> ProcessedEmail:
        keys = row.keys()
        return ProcessedEmail(
            id=row["id"],
            account_id=row["account_id"],
            gmail_message_id=row["gmail_message_id"],
            gmail_thread_id=row["gmail_thread_id"],
            category=row["category"],
            subject=row["subject"],
            processed_at=datetime.fromisoformat(row["processed_at"]),
            raw_labels=row["raw_labels"],
            sender=row["sender"] if "sender" in keys else None,
            actions_taken=row["actions_taken"] if "actions_taken" in keys else None,
            was_archived=bool(row["was_archived"]) if "was_archived" in keys else False,
            applied_label_names=row["applied_label_names"] if "applied_label_names" in keys else None,
        )
