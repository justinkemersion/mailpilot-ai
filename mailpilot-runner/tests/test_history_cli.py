"""CLI tests for the history command (no real Gmail)."""

from __future__ import annotations

from contextlib import contextmanager

import pytest
from rich.console import Console
from typer.testing import CliRunner


@pytest.fixture
def _openai_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-for-cli")
    monkeypatch.setenv("SUPABASE_URL", "http://127.0.0.1:54321")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-svc")


def test_history_command_prints_table(_openai_key, monkeypatch):
    rows = [
        {
            "id": 1,
            "account_id": 1,
            "gmail_message_id": "abc123",
            "category": "work",
            "subject": "Hello",
            "processed_at": "2026-01-15T12:00:00+00:00",
            "sender": "boss@example.com",
            "actions_taken": "Labeled: work",
            "was_archived": 0,
            "applied_label_names": '["work"]',
            "account_email": "me@example.com",
        }
    ]

    class FakeProcessedRepo:
        def search_history(self, **kwargs):
            return list(rows)

    @contextmanager
    def _ctx():
        yield type("A", (), {})(), FakeProcessedRepo()

    monkeypatch.setattr("mailpilot.persistence.repository_context", _ctx)
    monkeypatch.setattr(
        "mailpilot.cli._history_console",
        lambda: Console(width=200, height=40, soft_wrap=False),
    )

    from mailpilot.cli import app

    runner = CliRunner()
    result = runner.invoke(app, ["history", "--days-back", "30"])
    assert result.exit_code == 0, result.stdout + result.stderr
    assert "me@example.com" in result.stdout
    assert "Hello" in result.stdout
    assert "boss@" in result.stdout
    assert "work" in result.stdout
    assert "abc123" in result.stdout


def test_history_undo_calls_gmail_and_marks_undone(_openai_key, monkeypatch):
    rows = [
        {
            "id": 42,
            "account_id": 1,
            "gmail_message_id": "mid-99",
            "category": "work",
            "subject": "S",
            "processed_at": "2026-01-15T12:00:00+00:00",
            "sender": "a@b.com",
            "actions_taken": "Archived",
            "was_archived": 1,
            "applied_label_names": '["work"]',
            "account_email": "me@example.com",
        }
    ]

    class FakeProcessedRepo:
        def __init__(self) -> None:
            self.last_undone: int | None = None

        def search_history(self, **kwargs):
            return list(rows)

        def mark_undone(self, pid: int) -> None:
            self.last_undone = pid

    class FakeAccountRepo:
        def update_token(self, *_a, **_k) -> None:
            pass

    proc = FakeProcessedRepo()

    @contextmanager
    def _ctx():
        yield FakeAccountRepo(), proc

    class FakeSafeClient:
        def __init__(self, *_a, **_k) -> None:
            self.undo_calls: list[tuple] = []

        def undo_actions(self, email, mid, labels, was_archived):
            self.undo_calls.append((email, mid, labels, was_archived))

        def get_refreshed_tokens(self):
            return {}

    fake_client = FakeSafeClient()

    monkeypatch.setattr("mailpilot.persistence.repository_context", _ctx)
    monkeypatch.setattr("mailpilot.gmail_client.SafeGmailClient", lambda *a, **k: fake_client)

    from mailpilot.cli import app

    runner = CliRunner()
    result = runner.invoke(app, ["history", "--undo", "--message-id", "mid-99", "--days-back", "30"])
    assert result.exit_code == 0, result.stdout + result.stderr
    assert fake_client.undo_calls == [
        ("me@example.com", "mid-99", ["work"], True),
    ]
    assert proc.last_undone == 42
