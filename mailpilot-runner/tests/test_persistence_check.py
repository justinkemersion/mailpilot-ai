"""Tests for database connectivity helper (mocked)."""

from unittest.mock import MagicMock, patch

from mailpilot.persistence import check_supabase_connection


def test_check_supabase_connection_ok():
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.limit.return_value.execute.return_value.data = []

    with patch("mailpilot.persistence.flux_configured", return_value=False):
        with patch("mailpilot.persistence.create_db_client", return_value=mock_client):
            ok, msg = check_supabase_connection()

    assert ok is True
    assert "OK" in msg


def test_check_supabase_connection_missing_env():
    with patch("mailpilot.persistence.flux_configured", return_value=False):
        with patch(
            "mailpilot.persistence.create_db_client",
            side_effect=RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required but not set"
            ),
        ):
            ok, msg = check_supabase_connection()

    assert ok is False
    assert "SUPABASE" in msg
