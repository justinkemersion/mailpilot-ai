from __future__ import annotations

import logging
from typing import Optional

import typer

from .config import load_config
from .scheduler import run_forever, run_once


logger = logging.getLogger(__name__)

app = typer.Typer(help="MailPilot - AI-powered Gmail inbox manager")


@app.callback()
def common() -> None:
    """
    Common initialization for all commands.

    At the moment, configuration and logging are handled in main.py,
    so this is a placeholder for future global options (e.g. --config).
    """
    # Intentionally empty for now.
    return


@app.command("run")
def run_command(
    interval: Optional[int] = typer.Option(
        None,
        "--interval",
        "-i",
        help="Polling interval in seconds (overrides MAILPILOT_POLL_INTERVAL_SECONDS).",
    ),
) -> None:
    """
    Run MailPilot in a continuous loop, periodically processing new emails.
    """
    config = load_config()
    effective_interval = interval or config.poll_interval_seconds
    logger.info("Starting MailPilot continuous run (interval=%s)", effective_interval)
    run_forever(effective_interval)


@app.command("run-once")
def run_once_command() -> None:
    """
    Process new emails for all accounts once and exit.
    """
    logger.info("Running MailPilot once")
    run_once()


@app.command("add-account")
def add_account_command() -> None:
    """
    Add a new Gmail account via OAuth and store its credentials.
    """
    from .gmail_client import add_account_via_oauth

    logger.info("Adding a new Gmail account")
    add_account_via_oauth()


@app.command("summarize")
def summarize_command(
    limit: int = typer.Option(20, help="Number of recent important emails to show."),
) -> None:
    """
    Show a summary of recent categorized emails.
    """
    from .database import ProcessedEmailRepository, get_connection

    conn = get_connection()
    repo = ProcessedEmailRepository(conn)
    summary = repo.summarize_recent(limit=limit)

    typer.echo("Recent categorized emails:")
    for item in summary:
        typer.echo(
            f"[{item['processed_at']}] {item['account_email']} "
            f"{item['category']}: {item['subject']}"
        )
