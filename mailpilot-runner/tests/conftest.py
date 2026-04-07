"""Shared pytest fixtures."""

import sqlite3

import pytest


@pytest.fixture(autouse=True)
def _reset_mailpilot_in_memory_db_between_tests() -> None:
    """
    mailpilot.database reuses a single global SQLite :memory: connection.
    Reset it after each test so MAILPILOT_DB_PATH=:memory: stays isolated.
    """
    yield
    import mailpilot.database as db_mod

    conn = db_mod._IN_MEMORY_CONN
    if conn is not None:
        try:
            conn.close()
        except sqlite3.Error:
            pass
        db_mod._IN_MEMORY_CONN = None
