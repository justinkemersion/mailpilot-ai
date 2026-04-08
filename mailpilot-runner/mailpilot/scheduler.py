from __future__ import annotations

import logging
import signal
import time
from typing import Any, Callable, Optional

from supabase import create_client

from .ai_classifier import ClassificationError
from .config import load_config
from .email_processor import EmailProcessor, RunResult
from .gmail_client import GmailApiError
from .persistence import RunJobRepository


logger = logging.getLogger(__name__)


def run_once(
    dry_run: bool = False,
    search_query: str | None = None,
    user_id: str | None = None,
    run_job_id: int | None = None,
    run_job_repo: RunJobRepository | None = None,
) -> RunResult:
    """
    Process new emails once. If ``user_id`` is set, only that user's accounts;
    otherwise all active accounts (CLI / operator mode).

    When ``run_job_id`` and ``run_job_repo`` are set (web-triggered jobs), the
    processor reports incremental progress to ``run_jobs.progress``.
    """
    proc_kwargs: dict[str, Any] = {}
    if search_query is not None:
        proc_kwargs["search_query"] = search_query
    if run_job_id is not None and run_job_repo is not None:
        proc_kwargs["run_job_id"] = run_job_id
        proc_kwargs["run_job_repo"] = run_job_repo
    processor = EmailProcessor(**proc_kwargs)
    if dry_run:
        processor.enable_dry_run()
    return processor.process_all_accounts_once(user_id=user_id)


def run_forever(
    interval_seconds: int,
    dry_run: bool = False,
    search_query: str | None = None,
    on_run_done: Optional[Callable[[RunResult], None]] = None,
) -> None:
    """
    Run an internal loop that periodically processes new emails.
    If on_run_done is provided, it is called with the RunResult after each run.
    """
    stop = False

    def _handle_signal(signum: int, frame: object) -> None:
        nonlocal stop
        logger.info("Received signal %s, shutting down gracefully", signum)
        stop = True

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    logger.info("Starting scheduler loop with interval=%s seconds", interval_seconds)
    while not stop:
        start = time.time()
        try:
            result = run_once(dry_run=dry_run, search_query=search_query)
            if on_run_done is not None:
                on_run_done(result)
        except (GmailApiError, ClassificationError, RuntimeError) as exc:
            logger.exception("Recoverable error during scheduled run: %s", exc)
        elapsed = time.time() - start
        sleep_for = max(0, interval_seconds - elapsed)
        if sleep_for > 0 and not stop:
            time.sleep(sleep_for)


def _run_result_to_dict(result: RunResult) -> dict[str, Any]:
    return {
        "accounts_processed": result.accounts_processed,
        "candidates": result.candidates,
        "processed": result.processed,
        "labels_applied": result.labels_applied,
        "archived": result.archived,
        "spam_marked": result.spam_marked,
        "dry_run": result.dry_run,
    }


def watch_jobs(poll_interval: int = 5) -> None:
    """
    Long-running loop that polls Supabase for pending run_jobs and executes them.
    Start this via: python -m mailpilot.main watch-jobs

    The runner claims each job atomically (status: pending → running), executes
    run_once() with the stored options, then marks the job done or failed.
    SIGINT / SIGTERM cause a clean exit after the current job finishes.
    """
    cfg = load_config()
    client = create_client(cfg.supabase_url, cfg.supabase_service_role_key)
    job_repo = RunJobRepository(client)

    stop = False

    def _handle_signal(signum: int, frame: object) -> None:
        nonlocal stop
        logger.info("Received signal %s — finishing current job then exiting", signum)
        stop = True

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    logger.info(
        "watch-jobs: polling every %s seconds for pending run_jobs…", poll_interval
    )

    try:
        n_reaped = job_repo.reap_stale_running_jobs()
        if n_reaped > 0:
            logger.info("watch-jobs: startup reaped %s stale running job(s)", n_reaped)
    except Exception:  # noqa: BLE001
        logger.exception("watch-jobs: startup stale job reaper failed; continuing")

    while not stop:
        try:
            n_reaped = job_repo.reap_stale_running_jobs()
            if n_reaped > 0:
                logger.info("watch-jobs: reaped %s stale running job(s)", n_reaped)
        except Exception:  # noqa: BLE001
            logger.exception("watch-jobs: stale job reaper failed; continuing")

        try:
            job = job_repo.claim_next_pending()
        except Exception:  # noqa: BLE001
            logger.exception("watch-jobs: claim failed; backing off")
            time.sleep(poll_interval)
            continue

        if job is None:
            time.sleep(poll_interval)
            continue

        job_id: int = int(job["id"])
        job_user_id: str = str(job["user_id"])
        options: dict[str, Any] = job.get("options") or {}
        newer_than_days: int | None = options.get("newer_than_days")  # type: ignore[assignment]
        include_read: bool = bool(options.get("include_read", False))
        dry_run: bool = bool(options.get("dry_run", False))

        # Build a Gmail search query from options
        terms: list[str] = []
        if newer_than_days is not None:
            terms.append(f"newer_than:{newer_than_days}d")
        if not include_read:
            terms.append("is:unread")
        search_query: str | None = " ".join(terms) if terms else None

        logger.info(
            "watch-jobs: claimed job %s user_id=%s (newer_than_days=%s, include_read=%s, dry_run=%s)",
            job_id,
            job_user_id,
            newer_than_days,
            include_read,
            dry_run,
        )

        try:
            job_repo.update_job_progress(job_id, "starting", "Starting sync…")
            result = run_once(
                dry_run=dry_run,
                search_query=search_query,
                user_id=job_user_id,
                run_job_id=job_id,
                run_job_repo=job_repo,
            )
            job_repo.mark_done(job_id, _run_result_to_dict(result))
            logger.info(
                "watch-jobs: job %s done — %s processed, %s archived",
                job_id,
                result.processed,
                result.archived,
            )
        except Exception as exc:  # noqa: BLE001
            error_msg = f"{type(exc).__name__}: {exc}"
            logger.exception("watch-jobs: job %s failed: %s", job_id, error_msg)
            job_repo.mark_failed(job_id, error_msg)

    logger.info("watch-jobs: exiting cleanly")
