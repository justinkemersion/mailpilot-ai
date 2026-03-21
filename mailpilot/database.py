from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional

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
    account_summaries: List[tuple[int, str, int]]  # account id, email, processed count
    orphan_processed_count: int
    duplicate_key_groups: int
    cross_account_message_id_count: int
    messages: List[str]


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
    messages: List[str] = []
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
        summaries: List[tuple[int, str, int]] = [
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
            FOREIGN KEY(account_id) REFERENCES accounts(id),
            UNIQUE(account_id, gmail_message_id)
        );
        """
    )
    conn.commit()


class AccountRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def add_or_update(self, email: str, token_json: str, display_name: Optional[str]) -> Account:
        now = datetime.now(timezone.utc).isoformat()
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
        return self.get_by_email(email)

    def get_by_id(self, account_id: int) -> Optional[Account]:
        cur = self._conn.cursor()
        cur.execute("SELECT * FROM accounts WHERE id = ?", (account_id,))
        row = cur.fetchone()
        return self._row_to_account(row) if row else None

    def get_by_email(self, email: str) -> Optional[Account]:
        cur = self._conn.cursor()
        cur.execute("SELECT * FROM accounts WHERE email = ? AND active = 1", (email,))
        row = cur.fetchone()
        return self._row_to_account(row) if row else None

    def update_token(self, account_id: int, token_json: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        cur = self._conn.cursor()
        cur.execute(
            "UPDATE accounts SET token_json = ?, updated_at = ? WHERE id = ?",
            (token_json, now, account_id),
        )
        self._conn.commit()

    def list_active(self) -> List[Account]:
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
        subject: Optional[str],
        gmail_thread_id: Optional[str],
        raw_labels: Optional[str],
    ) -> ProcessedEmail:
        now = datetime.now(timezone.utc).isoformat()
        cur = self._conn.cursor()
        cur.execute(
            """
            INSERT OR IGNORE INTO processed_emails
            (account_id, gmail_message_id, gmail_thread_id, category, subject, processed_at, raw_labels)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                account_id,
                gmail_message_id,
                gmail_thread_id,
                category,
                subject,
                now,
                raw_labels,
            ),
        )
        self._conn.commit()

        cur.execute(
            "SELECT * FROM processed_emails WHERE account_id = ? AND gmail_message_id = ?",
            (account_id, gmail_message_id),
        )
        row = cur.fetchone()
        return self._row_to_processed(row)

    def summarize_recent(self, limit: int = 20) -> List[Dict[str, Any]]:
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
        return ProcessedEmail(
            id=row["id"],
            account_id=row["account_id"],
            gmail_message_id=row["gmail_message_id"],
            gmail_thread_id=row["gmail_thread_id"],
            category=row["category"],
            subject=row["subject"],
            processed_at=datetime.fromisoformat(row["processed_at"]),
            raw_labels=row["raw_labels"],
        )
