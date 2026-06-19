"""Tests for database connectivity helper (mocked)."""

from unittest.mock import MagicMock, patch

from mailpilot.persistence import check_db_connection


def test_check_db_connection_ok():
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.limit.return_value.execute.return_value.data = []

    with patch("mailpilot.persistence.create_db_client", return_value=mock_client):
        ok, msg = check_db_connection()

    assert ok is True
    assert "Flux OK" in msg


def test_check_db_connection_missing_env():
    with patch(
        "mailpilot.persistence.create_db_client",
        side_effect=RuntimeError(
            "FLUX_API_URL (or NEXT_PUBLIC_FLUX_URL) and FLUX_SERVICE_TOKEN are required but not set"
        ),
    ):
        ok, msg = check_db_connection()

    assert ok is False
    assert "FLUX" in msg
