from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from rich.console import Console
from rich.panel import Panel
from rich.text import Text


_console = Console()


def _panel(title: str, body: str) -> None:
    headline = Text(title, style="bold red")
    _console.print(Panel.fit(body, title=headline, expand=False))


def render_config_error(exc: RuntimeError) -> bool:
    """
    Render a friendly, styled error screen for known configuration mistakes.

    Returns True if the error was recognized and rendered, False otherwise.
    """
    message = str(exc)

    if "OPENAI_API_KEY is required" in message:
        _render_openai_api_key_error()
        return True

    if "GOOGLE_CREDENTIALS_FILE must point to a valid OAuth client secrets JSON" in message:
        _render_gmail_credentials_error()
        return True

    return False


def _render_openai_api_key_error() -> None:
    current = os.getenv("OPENAI_API_KEY")
    masked = "<not set>" if not current else "<set (hidden)>"

    body = (
        "MailPilot could not start because your OpenAI API key is missing.\n\n"
        f"Detected OPENAI_API_KEY: {masked}\n\n"
        "How to fix this:\n"
        "  1. Sign in to your OpenAI account and create an API key.\n"
        "  2. Open your project .env file and add:\n"
        "       OPENAI_API_KEY=sk-your-key-here\n"
        "  3. Save the file and re-run the command.\n"
    )
    _panel("Missing OpenAI API key", body)


def _render_gmail_credentials_error() -> None:
    raw = os.getenv("GOOGLE_CREDENTIALS_FILE")
    if raw:
        path = Path(raw).expanduser()
        exists_msg = "exists" if path.exists() else "does NOT exist"
        location_line = f"Detected GOOGLE_CREDENTIALS_FILE: {path} ({exists_msg})"
    else:
        location_line = "Detected GOOGLE_CREDENTIALS_FILE: <not set>"

    body = (
        "MailPilot could not start the Gmail OAuth flow because it could not find\n"
        "a valid Google OAuth client credentials JSON file.\n\n"
        f"{location_line}\n\n"
        "How to fix this:\n"
        "  1. Go to the Google Cloud Console and create a project.\n"
        "  2. Enable the Gmail API and configure the OAuth consent screen.\n"
        "  3. Create OAuth 2.0 credentials of type Desktop application.\n"
        "  4. Download the client credentials JSON file to a secure location.\n"
        "  5. In your project .env file, set for example:\n"
        "       GOOGLE_CREDENTIALS_FILE=/full/path/to/google_client_secrets.json\n"
        "  6. Save the file and re-run:\n"
        "       python -m mailpilot.main add-account\n"
    )
    _panel("Missing or invalid Gmail OAuth credentials", body)

