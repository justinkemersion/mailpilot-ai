"""Shared pytest fixtures."""

import pytest


@pytest.fixture(autouse=True)
def _mailpilot_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Minimal env so load_config() and repository_context() can be constructed when not patched."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-mailpilot")
    monkeypatch.setenv("SUPABASE_URL", "http://127.0.0.1:54321")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
