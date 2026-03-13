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
    dry_run: bool = typer.Option(
        False,
        "--dry-run",
        help="Log intended actions without modifying Gmail labels or archiving.",
    ),
    newer_than_days: Optional[int] = typer.Option(
        None,
        "--newer-than-days",
        help="Only consider messages newer than this many days.",
    ),
    include_read: bool = typer.Option(
        False,
        "--include-read",
        help="Include read messages in addition to unread ones.",
    ),
    query: Optional[str] = typer.Option(
        None,
        "--query",
        help="Advanced: raw Gmail search query to refine INBOX candidates.",
    ),
) -> None:
    """
    Run MailPilot in a continuous loop, periodically processing new emails.
    """
    config = load_config()
    effective_interval = interval or config.poll_interval_seconds

    # Build Gmail search query based on options.
    if query is not None:
        search_query = query
        lower_q = query.lower()
        has_date_bound = "newer_than:" in lower_q or "after:" in lower_q or "older_than:" in lower_q
        has_unread = "is:unread" in lower_q
        if not has_date_bound and not has_unread:
            typer.confirm(
                "WARNING: This raw Gmail query has no date or unread filter and may scan your entire INBOX. Continue?",
                abort=True,
            )
    else:
        terms = []
        if newer_than_days is not None:
            terms.append(f"newer_than:{newer_than_days}d")
        if not include_read:
            terms.append("is:unread")
        search_query = " ".join(terms) if terms else None

        # Red-zone warning: include read mail with no date bound.
        if include_read and newer_than_days is None:
            typer.confirm(
                "WARNING: This will scan all messages in your INBOX, including old read mail. Continue?",
                abort=True,
            )

    logger.info(
        "Starting MailPilot continuous run (interval=%s, dry_run=%s)",
        effective_interval,
        dry_run,
    )
    run_forever(effective_interval, dry_run=dry_run, search_query=search_query)


@app.command("run-once")
def run_once_command(
    dry_run: bool = typer.Option(
        False,
        "--dry-run",
        help="Log intended actions without modifying Gmail labels or archiving.",
    ),
    newer_than_days: Optional[int] = typer.Option(
        None,
        "--newer-than-days",
        help="Only consider messages newer than this many days.",
    ),
    include_read: bool = typer.Option(
        False,
        "--include-read",
        help="Include read messages in addition to unread ones.",
    ),
    query: Optional[str] = typer.Option(
        None,
        "--query",
        help="Advanced: raw Gmail search query to refine INBOX candidates.",
    ),
) -> None:
    """
    Process new emails for all accounts once and exit.
    """
    # Build Gmail search query based on options.
    if query is not None:
        search_query = query
        lower_q = query.lower()
        has_date_bound = "newer_than:" in lower_q or "after:" in lower_q or "older_than:" in lower_q
        has_unread = "is:unread" in lower_q
        if not has_date_bound and not has_unread:
            typer.confirm(
                "WARNING: This raw Gmail query has no date or unread filter and may scan your entire INBOX. Continue?",
                abort=True,
            )
    else:
        terms = []
        if newer_than_days is not None:
            terms.append(f"newer_than:{newer_than_days}d")
        if not include_read:
            terms.append("is:unread")
        search_query = " ".join(terms) if terms else None

        # Red-zone warning: include read mail with no date bound.
        if include_read and newer_than_days is None:
            typer.confirm(
                "WARNING: This will scan all messages in your INBOX, including old read mail. Continue?",
                abort=True,
            )

    logger.info(
        "Running MailPilot once (dry_run=%s, search_query=%s)", dry_run, search_query or "<default>"
    )
    run_once(dry_run=dry_run, search_query=search_query)


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
