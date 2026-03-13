from __future__ import annotations

import logging
import signal
import sys
import time
from typing import Callable

from .email_processor import EmailProcessor


logger = logging.getLogger(__name__)


def run_once(dry_run: bool = False) -> None:
    """
    Process new emails for all accounts once.
    """
    processor = EmailProcessor(dry_run=dry_run)
    processor.process_all_accounts_once()


def run_forever(interval_seconds: int, dry_run: bool = False) -> None:
    """
    Run an internal loop that periodically processes new emails.
    """
    stop = False

    def _handle_signal(signum: int, frame) -> None:  # type: ignore[override]
        nonlocal stop
        logger.info("Received signal %s, shutting down gracefully", signum)
        stop = True

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    logger.info("Starting scheduler loop with interval=%s seconds", interval_seconds)
    while not stop:
        start = time.time()
        try:
            run_once(dry_run=dry_run)
        except Exception as exc:  # defensive; log and continue
            logger.exception("Error during scheduled run: %s", exc)
        elapsed = time.time() - start
        sleep_for = max(0, interval_seconds - elapsed)
        if sleep_for > 0 and not stop:
            time.sleep(sleep_for)
