import os
import sys
from pathlib import Path

import pytest

from mailpilot.main import main


def _run_main_with_args(monkeypatch, capsys, args, env: dict[str, str]) -> str:
    original_argv = sys.argv
    try:
        sys.argv = ["mailpilot.main", *args]
        # Ensure a clean env for the keys we care about
        for key in ["OPENAI_API_KEY", "GOOGLE_CREDENTIALS_FILE"]:
            if key in os.environ:
                monkeypatch.delenv(key, raising=False)
        for key, value in env.items():
            monkeypatch.setenv(key, value)

        with pytest.raises(SystemExit) as exc:
            main()
        assert exc.value.code == 1

        captured = capsys.readouterr()
        return captured.out
    finally:
        sys.argv = original_argv


def test_friendly_error_for_missing_openai_key(monkeypatch, capsys):
    output = _run_main_with_args(
        monkeypatch,
        capsys,
        ["run-once"],
        env={
            # Intentionally omit OPENAI_API_KEY
        },
    )
    assert "Missing OpenAI API key" in output
    assert "OPENAI_API_KEY" in output


def test_friendly_error_for_missing_gmail_credentials_file(monkeypatch, capsys, tmp_path):
    dummy_key = "sk-test"
    nonexistent_path = tmp_path / "does_not_exist.json"

    output = _run_main_with_args(
        monkeypatch,
        capsys,
        ["add-account"],
        env={
            "OPENAI_API_KEY": dummy_key,
            "GOOGLE_CREDENTIALS_FILE": str(nonexistent_path),
        },
    )

    assert "Missing or invalid Gmail OAuth credentials" in output
    assert "GOOGLE_CREDENTIALS_FILE" in output
    assert str(nonexistent_path) in output

