from __future__ import annotations

import json
import logging
import shutil

import typer
from rich.console import Console
from rich.table import Table

from .config import load_config
from .email_processor import RunResult
from .scheduler import run_forever, run_once, watch_jobs

logger = logging.getLogger(__name__)

app = typer.Typer(help="MailPilot - AI-powered Gmail inbox manager")


def _echo_run_summary(result: RunResult | None) -> None:
    """Print a short summary of what MailPilot did so the user sees feedback."""
    if result is None:
        return
    if result.accounts_processed == 0:
        typer.echo(
            "No active Gmail accounts in Supabase. Connect Gmail in the MailPilot web app first."
        )
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
            "Reconnect each address via the MailPilot web app (Connect Gmail). "
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
    interval: int | None = typer.Option(
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
    newer_than_days: int | None = typer.Option(
        None,
        "--newer-than-days",
        help="Only consider messages newer than this many days.",
    ),
    include_read: bool = typer.Option(
        False,
        "--include-read",
        help="Include read messages in addition to unread ones.",
    ),
    query: str | None = typer.Option(
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
    newer_than_days: int | None = typer.Option(
        None,
        "--newer-than-days",
        help="Only consider messages newer than this many days.",
    ),
    include_read: bool = typer.Option(
        False,
        "--include-read",
        help="Include read messages in addition to unread ones.",
    ),
    query: str | None = typer.Option(
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


@app.command("watch-jobs")
def watch_jobs_command(
    poll_interval: int = typer.Option(
        5,
        "--poll-interval",
        "-p",
        help="Seconds between polls for pending run_jobs.",
    ),
) -> None:
    """
    Watch for inbox-processing jobs queued from the MailPilot web app.

    Polls Supabase every POLL_INTERVAL seconds for pending run_jobs rows,
    claims and executes each one, then writes back the result. Run this
    alongside the web app so the 'Process inbox' button works.

    Example:
        python -m mailpilot.main watch-jobs
        python -m mailpilot.main watch-jobs --poll-interval 10
    """
    typer.secho(
        f"Watching for run_jobs (poll every {poll_interval}s) — press Ctrl+C to stop",
        fg=typer.colors.CYAN,
    )
    watch_jobs(poll_interval=poll_interval)


@app.command("supabase-check")
def supabase_check_command() -> None:
    """
    Verify SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and that core tables are reachable.
    Does not require OPENAI_API_KEY.
    """
    from .persistence import check_supabase_connection

    ok, message = check_supabase_connection()
    typer.echo(message)
    if ok:
        typer.secho("supabase-check: OK", fg=typer.colors.GREEN)
    else:
        typer.secho("supabase-check: FAILED", fg=typer.colors.RED)
        raise typer.Exit(code=1)


@app.command("summarize")
def summarize_command(
    limit: int = typer.Option(20, help="Number of recent processed rows to show."),
) -> None:
    """
    Show a summary of recent categorized emails (all categories).
    """
    from .persistence import repository_context

    with repository_context() as (_, repo):
        summary = repo.summarize_recent(limit=limit)

    typer.echo("Recent categorized emails:")
    for item in summary:
        typer.echo(
            f"[{item['processed_at']}] {item['account_email']} "
            f"{item['category']}: {item['subject']}"
        )


def _truncate(s: str | None, max_len: int = 48) -> str:
    if s is None:
        return ""
    t = str(s).replace("\n", " ")
    return t if len(t) <= max_len else t[: max_len - 1] + "…"


def _history_console() -> Console:
    """
    Match the real terminal width so Rich does not lay out the history table
    wider than the display (which would wrap box-drawing and look broken).
    """
    try:
        width = shutil.get_terminal_size().columns
    except OSError:
        width = 80
    width = max(40, width)
    # Height set so Rich has stable dimensions when not attached to a TTY.
    return Console(width=width, height=40, soft_wrap=False)


@app.command("history")
def history_command(
    sender: str | None = typer.Option(None, "--sender", help="Filter: sender contains (SQL LIKE)."),
    subject: str | None = typer.Option(None, "--subject", help="Filter: subject contains (SQL LIKE)."),
    category: str | None = typer.Option(None, "--category", help="Filter: exact AI category."),
    days_back: int = typer.Option(7, "--days-back", help="Only rows processed in the last N days."),
    action: str | None = typer.Option(None, "--action", help="Filter: actions_taken contains (SQL LIKE)."),
    limit: int = typer.Option(50, "--limit", help="Maximum rows to show or undo."),
    message_id: str | None = typer.Option(
        None, "--message-id", help="Exact Gmail message id (strong filter for undo)."
    ),
    account_email: str | None = typer.Option(
        None, "--account-email", help="Restrict to a single linked Gmail account."
    ),
    undo: bool = typer.Option(False, "--undo", help="Reverse MailPilot actions for matching row(s)."),
) -> None:
    """
    Search processed-email history in Supabase; optionally undo Gmail changes.
    """
    from .persistence import repository_context
    from .gmail_client import GmailApiError, GmailAuthError, GmailClient, SafeGmailClient

    with repository_context() as (_, repo):
        rows = repo.search_history(
            sender=sender,
            subject=subject,
            category=category,
            days_back=days_back,
            action=action,
            limit=limit,
            message_id=message_id,
            account_email=account_email,
        )

    console = _history_console()
    table = Table(show_header=True, header_style="bold")
    table.add_column("Date", max_width=20)
    table.add_column(
        "Gmail message ID",
        overflow="fold",
        max_width=28,
        style="cyan",
    )
    table.add_column("Account", max_width=26)
    table.add_column("Sender", max_width=32)
    table.add_column("Subject", max_width=40)
    table.add_column("Category", max_width=12)
    table.add_column("Actions taken", max_width=44)

    for row in rows:
        mid = row.get("gmail_message_id")
        table.add_row(
            _truncate(row.get("processed_at"), 20),
            str(mid) if mid is not None else "",
            _truncate(row.get("account_email"), 26),
            _truncate(row.get("sender"), 32),
            _truncate(row.get("subject"), 40),
            _truncate(row.get("category"), 12),
            _truncate(row.get("actions_taken"), 44),
        )
    console.print(table)

    if not undo:
        return

    if not rows:
        typer.echo("No rows matched; nothing to undo.")
        raise typer.Exit(code=0)

    if len(rows) > 1:
        typer.confirm(
            f"This will undo MailPilot actions for {len(rows)} message(s). Continue?",
            abort=True,
        )

    client = SafeGmailClient(GmailClient())
    with repository_context() as (account_repo, proc_repo):
        for row in rows:
            actions_str = row.get("actions_taken") or ""
            if "[UNDONE]" in actions_str:
                typer.secho(
                    f"Skip message {row.get('gmail_message_id')}: already marked undone.",
                    fg=typer.colors.YELLOW,
                )
                continue
            raw_labels = row.get("applied_label_names")
            try:
                label_list = json.loads(raw_labels) if raw_labels else []
            except json.JSONDecodeError:
                label_list = []
            if not isinstance(label_list, list):
                label_list = []
            label_names = [str(x) for x in label_list]
            was_archived = bool(row.get("was_archived"))
            acc = row.get("account_email") or ""
            mid = row.get("gmail_message_id") or ""
            try:
                client.undo_actions(acc, mid, label_names, was_archived)
            except GmailAuthError as exc:
                typer.secho(str(exc), fg=typer.colors.YELLOW)
                continue
            except GmailApiError as exc:
                typer.secho(str(exc), fg=typer.colors.RED)
                continue
            proc_repo.mark_undone(int(row["id"]))
        refreshed = client.get_refreshed_tokens()
        for account_id, new_token_json in refreshed.items():
            account_repo.update_token(account_id, new_token_json)

    typer.secho("Undo complete.", fg=typer.colors.GREEN)
