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

    if "OPENAI API key" in message or "OPENAI_API_KEY is required" in message:
        _render_openai_api_key_error()
        return True

    if (
        "MAILPILOT_CLOUDFLARE_API_TOKEN" in message
        or "MAILPILOT_CLOUDFLARE_ACCOUNT_ID" in message
        or "CLOUDFLARE_API_TOKEN" in message
        or "CLOUDFLARE_ACCOUNT_ID" in message
    ):
        _render_cloudflare_credentials_error()
        return True

    if (
        "FLUX_SERVICE_TOKEN" in message
        or "FLUX_API_URL" in message
        or "NEXT_PUBLIC_FLUX_URL" in message
    ):
        _render_flux_credentials_error()
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


def _render_cloudflare_credentials_error() -> None:
    body = (
        "MailPilot could not start because Cloudflare Workers AI credentials are missing.\n\n"
        "Set in mailpilot-runner/.env (or /etc/mailpilot/runner.env on the server):\n"
        "  MAILPILOT_AI_PROVIDER=cloudflare\n"
        "  MAILPILOT_CLOUDFLARE_ACCOUNT_ID=<your-account-id>\n"
        "  MAILPILOT_CLOUDFLARE_API_TOKEN=<api-token-with-workers-ai-read>\n"
        "  MAILPILOT_CLOUDFLARE_MODEL=@cf/meta/llama-3.1-8b-instruct-fast\n\n"
        "Create the token in the Cloudflare dashboard (Workers AI Read).\n"
        "Free-tier Workers AI includes daily Neuron limits for small models like Llama 8B.\n"
    )
    _panel("Missing Cloudflare Workers AI configuration", body)


def _render_flux_credentials_error() -> None:
    body = (
        "The worker could not start because Flux database credentials are missing.\n\n"
        "Set in mailpilot-runner/.env (or /etc/mailpilot/runner.env on the server):\n"
        "  FLUX_API_URL=https://api--<project>--<hash>.vsl-base.com\n"
        "  FLUX_SERVICE_TOKEN=<flux-service-token>\n"
        "  FLUX_POSTGREST_SCHEMA=api\n\n"
        "Use the same values as mailpilot-web (`flux project credentials`).\n"
        "Gmail accounts are linked via the MailPilot web app, not the CLI.\n"
    )
    _panel("Missing Flux configuration", body)
