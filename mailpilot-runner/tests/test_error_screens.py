import os
import sys

import pytest

from mailpilot.main import main


def _run_main_with_args(monkeypatch, capsys, args, env: dict[str, str]) -> str:
    original_argv = sys.argv
    try:
        sys.argv = ["mailpilot.main", *args]
        for key in [
            "OPENAI_API_KEY",
            "FLUX_API_URL",
            "FLUX_SERVICE_TOKEN",
            "SUPABASE_URL",
            "SUPABASE_SERVICE_ROLE_KEY",
        ]:
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
            "FLUX_API_URL": "http://localhost",
            "FLUX_SERVICE_TOKEN": "x",
        },
    )
    assert "Missing OpenAI API key" in output
    assert "OPENAI_API_KEY" in output


def test_friendly_error_for_missing_flux_credentials(monkeypatch, capsys):
    output = _run_main_with_args(
        monkeypatch,
        capsys,
        ["run-once"],
        env={
            "OPENAI_API_KEY": "sk-test",
        },
    )

    assert "Missing Flux configuration" in output
    assert "FLUX_API_URL" in output
