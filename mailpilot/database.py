from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional

from .config import load_config
from .models import Account, ProcessedEmail


def _get_db_path() -> Path:
    return load_config().db_path


def get_connection() -> sqlite3.Connection:
    """
    Get a SQLite connection, ensuring the schema exists.
    """
    db_path = _get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    _init_schema(conn)
    return conn


@contextmanager
def connection_ctx() -> Iterator[sqlite3.Connection]:
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    finally:
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

    def get_by_email(self, email: str) -> Optional[Account]:
        cur = self._conn.cursor()
        cur.execute("SELECT * FROM accounts WHERE email = ? AND active = 1", (email,))
        row = cur.fetchone()
        return self._row_to_account(row) if row else None

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
