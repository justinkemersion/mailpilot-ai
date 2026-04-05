from __future__ import annotations

import logging
from typing import Optional

import typer

from .config import load_config
from .email_processor import RunResult
from .scheduler import run_forever, run_once


logger = logging.getLogger(__name__)

app = typer.Typer(help="MailPilot - AI-powered Gmail inbox manager")


def _echo_run_summary(result: RunResult | None) -> None:
    """Print a short summary of what MailPilot did so the user sees feedback."""
    if result is None:
        return
    if result.accounts_processed == 0:
        typer.echo("No accounts configured. Run 'add-account' to add a Gmail account.")
        return
    prefix = "Would have: " if result.dry_run else ""
    typer.echo(
        f"MailPilot run complete: {result.accounts_processed} account(s), "
        f"{result.candidates} message(s) in inbox, {result.processed} processed. "
        f"{prefix}Labels: {result.labels_applied}, archived: {result.archived}, spam: {result.spam_marked}."
    )
    if result.accounts_needing_reauth:
        emails = ", ".join(result.accounts_needing_reauth)
        typer.secho(
            f"\nGmail sign-in expired or revoked for: {emails}",
            fg=typer.colors.YELLOW,
        )
        typer.secho(
            "Run: python -m mailpilot.main add-account — sign in again for each address above. "
            "Google OAuth apps in 'Testing' mode usually need re-consent about once a week.",
            fg=typer.colors.YELLOW,
        )


def _build_search_query(
    query: str | None,
    newer_than_days: int | None,
    include_read: bool,
) -> str | None:
    """
    Build a Gmail search query from CLI options, prompting the user for
    confirmation when the resulting query has no safety bounds.
    """
    if query is not None:
        lower_q = query.lower()
        has_date_bound = "newer_than:" in lower_q or "after:" in lower_q or "older_than:" in lower_q
        has_unread = "is:unread" in lower_q
        if not has_date_bound and not has_unread:
            typer.confirm(
                "WARNING: This raw Gmail query has no date or unread filter "
                "and may scan your entire INBOX. Continue?",
                abort=True,
            )
        return query

    terms: list[str] = []
    if newer_than_days is not None:
        terms.append(f"newer_than:{newer_than_days}d")
    if not include_read:
        terms.append("is:unread")

    if include_read and newer_than_days is None:
        typer.confirm(
            "WARNING: This will scan all messages in your INBOX, "
            "including old read mail. Continue?",
            abort=True,
        )

    return " ".join(terms) if terms else None


@app.callback()
def common() -> None:
    """
    Common initialization for all commands.

    At the moment, configuration and logging are handled in main.py,
    so this is a placeholder for future global options (e.g. --config).
    """
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
    search_query = _build_search_query(query, newer_than_days, include_read)

    logger.info(
        "Starting MailPilot continuous run (interval=%s, dry_run=%s)",
        effective_interval,
        dry_run,
    )
    run_forever(
        effective_interval,
        dry_run=dry_run,
        search_query=search_query,
        on_run_done=_echo_run_summary,
    )


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
    search_query = _build_search_query(query, newer_than_days, include_read)

    logger.info(
        "Running MailPilot once (dry_run=%s, search_query=%s)", dry_run, search_query or "<default>"
    )
    result = run_once(dry_run=dry_run, search_query=search_query)
    _echo_run_summary(result)


@app.command("add-account")
def add_account_command() -> None:
    """
    Add a new Gmail account via OAuth and store its credentials.
    """
    from .gmail_client import add_account_via_oauth

    logger.info("Adding a new Gmail account")
    add_account_via_oauth()


@app.command("db-check")
def db_check_command() -> None:
    """
    Verify SQLite database integrity, foreign keys, and multi-account isolation.
    Does not require OPENAI_API_KEY (only reads MAILPILOT_DB_PATH / default data path).
    """
    from .database import check_database_at_path, resolve_database_file_path

    path = resolve_database_file_path()
    report = check_database_at_path(path)

    typer.echo(f"Database: {report.db_path_display}")
    typer.echo(f"Integrity: {report.integrity}")
    typer.echo(f"Foreign key violations: {report.foreign_key_violation_count}")
    typer.echo(f"Active accounts: {report.active_accounts}")
    typer.echo(f"Processed emails (total): {report.processed_emails_total}")
    for acc_id, email, n in report.account_summaries:
        typer.echo(f"  account id={acc_id} {email!r}: {n} processed row(s)")
    typer.echo(f"Orphan processed rows: {report.orphan_processed_count}")
    typer.echo(f"Duplicate (account, message) groups: {report.duplicate_key_groups}")
    if report.cross_account_message_id_count:
        typer.echo(
            f"Gmail message ids shared across accounts: {report.cross_account_message_id_count} "
            "(informational)"
        )
    for msg in report.messages:
        typer.secho(msg, fg=typer.colors.YELLOW if report.ok else typer.colors.RED)
    if report.ok:
        typer.secho("db-check: OK", fg=typer.colors.GREEN)
    else:
        typer.secho("db-check: FAILED", fg=typer.colors.RED)
        raise typer.Exit(code=1)


@app.command("summarize")
def summarize_command(
    limit: int = typer.Option(20, help="Number of recent processed rows to show."),
) -> None:
    """
    Show a summary of recent categorized emails (all categories).
    """
    from .database import ProcessedEmailRepository, connection_ctx

    with connection_ctx() as conn:
        repo = ProcessedEmailRepository(conn)
        summary = repo.summarize_recent(limit=limit)

    typer.echo("Recent categorized emails:")
    for item in summary:
        typer.echo(
            f"[{item['processed_at']}] {item['account_email']} "
            f"{item['category']}: {item['subject']}"
        )
