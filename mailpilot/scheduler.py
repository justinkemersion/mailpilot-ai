from __future__ import annotations

import logging
import sqlite3
import signal
import time
from typing import Callable, Optional

from .ai_classifier import ClassificationError
from .email_processor import EmailProcessor, RunResult
from .gmail_client import GmailApiError


logger = logging.getLogger(__name__)


def run_once(dry_run: bool = False, search_query: str | None = None) -> RunResult:
    """
    Process new emails for all accounts once. Returns a run summary.
    """
    processor = EmailProcessor() if search_query is None else EmailProcessor(search_query=search_query)
    if dry_run:
        processor.enable_dry_run()
    return processor.process_all_accounts_once()


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
        except (GmailApiError, ClassificationError, sqlite3.Error, RuntimeError) as exc:
            logger.exception("Recoverable error during scheduled run: %s", exc)
        elapsed = time.time() - start
        sleep_for = max(0, interval_seconds - elapsed)
        if sleep_for > 0 and not stop:
            time.sleep(sleep_for)
