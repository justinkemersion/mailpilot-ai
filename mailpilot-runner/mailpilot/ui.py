from __future__ import annotations

import os

from rich.console import Console
from rich.panel import Panel
from rich.text import Text


_console = Console()


def _panel(title: str, body: str) -> None:
    headline = Text(title, style="bold red")
    _console.print(Panel.fit(body, title=headline))


def render_config_error(exc: RuntimeError) -> bool:
    """
    Render a friendly, styled error screen for known configuration mistakes.

    Returns True if the error was recognized and rendered, False otherwise.
    """
    message = str(exc)

    if "OPENAI_API_KEY is required" in message:
        _render_openai_api_key_error()
        return True

    if "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" in message:
        _render_supabase_credentials_error()
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


def _render_supabase_credentials_error() -> None:
    body = (
        "The worker could not start because Supabase credentials are missing.\n\n"
        "Set in mailpilot-runner/.env (never commit the service role key):\n"
        "  SUPABASE_URL=https://<project-ref>.supabase.co\n"
        "  SUPABASE_SERVICE_ROLE_KEY=<service-role-secret>\n\n"
        "Use the service role key only on trusted servers (it bypasses RLS).\n"
        "Gmail accounts are linked via the MailPilot web app, not the CLI.\n"
    )
    _panel("Missing Supabase configuration", body)
