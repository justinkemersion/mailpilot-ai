from __future__ import annotations

import logging
from typing import List

from .ai_classifier import Classifier, OpenAIClassifier
from .database import (
    AccountRepository,
    ProcessedEmailRepository,
    connection_ctx,
)
from .gmail_client import GmailClient
from .models import Account


logger = logging.getLogger(__name__)


class EmailProcessor:
    """
    Orchestrates fetch → classify → label for all accounts.
    """

    def __init__(
        self,
        gmail_client: GmailClient | None = None,
        classifier: Classifier | None = None,
        max_archives_per_run: int = 50,
        max_spam_marks_per_run: int = 20,
        search_query: str | None = "is:unread",
    ) -> None:
        self._gmail_client = gmail_client or GmailClient()
        self._classifier = classifier or OpenAIClassifier()
        self._max_archives_per_run = max_archives_per_run
        self._max_spam_marks_per_run = max_spam_marks_per_run
        self._archives_this_run = 0
        self._spam_marks_this_run = 0
        self._dry_run = False
        self._search_query = search_query

    def enable_dry_run(self) -> None:
        """
        Enable dry-run mode, where actions are logged but not sent to Gmail.
        """
        self._dry_run = True

    def process_all_accounts_once(self) -> None:
        # Reset per-run counters for rate limiting
        self._archives_this_run = 0
        self._spam_marks_this_run = 0
        with connection_ctx() as conn:
            account_repo = AccountRepository(conn)
            processed_repo = ProcessedEmailRepository(conn)

            accounts = account_repo.list_active()
            if not accounts:
                logger.info("No active accounts configured")
                return

            for account in accounts:
                self._process_account(account, processed_repo)

    def _process_account(
        self,
        account: Account,
        processed_repo: ProcessedEmailRepository,
    ) -> None:
        logger.info("Processing account %s", account.email)

        labels_map: dict[str, str] = {}
        if not self._dry_run:
            labels_map = self._gmail_client.ensure_labels(account)
        inbox_label = "INBOX"

        message_ids = self._gmail_client.list_messages(
            account,
            label_ids=[inbox_label],
            query=self._search_query,
            max_results=100,
        )
        logger.info("Found %d candidate messages for %s", len(message_ids), account.email)

        for message_id in message_ids:
            if processed_repo.is_processed(account.id, message_id):
                continue

            msg = self._gmail_client.get_message(account, message_id)
            classification = self._classifier.classify(
                subject=msg.subject,
                sender=msg.sender,
                body=msg.body,
                snippet=msg.snippet,
            )

            if self._dry_run:
                logger.info(
                    "DRY-RUN: would classify message %s for %s as %s",
                    msg.id,
                    account.email,
                    classification.category,
                )
                continue

            processed_repo.mark_processed(
                account_id=account.id,
                gmail_message_id=msg.id,
                category=classification.category,
                subject=msg.subject,
                gmail_thread_id=msg.thread_id,
                raw_labels=",".join(msg.labels) if msg.labels else None,
            )

            self._apply_actions(
                account=account,
                msg_id=msg.id,
                labels_map=labels_map,
                category=classification.category,
            )

    def _apply_actions(
        self,
        account: Account,
        msg_id: str,
        labels_map: dict[str, str],
        category: str,
    ) -> None:
        add_ids: List[str] = []

        if self._dry_run:
            logger.info(
                "DRY-RUN: would apply actions for message %s in account %s with category %s",
                msg_id,
                account.email,
                category,
            )
            return

        def _maybe_add(label_name: str) -> None:
            lid = labels_map.get(label_name)
            if lid:
                add_ids.append(lid)

        if category == "important":
            _maybe_add("mailpilot/important")
            self._gmail_client.flag_important(account, msg_id)
        elif category == "work":
            _maybe_add("work")
        elif category == "receipts":
            _maybe_add("receipts")
        elif category == "newsletters":
            _maybe_add("newsletters")
            if self._archives_this_run < self._max_archives_per_run:
                self._gmail_client.archive_message(account, msg_id)
                self._archives_this_run += 1
            else:
                logger.warning(
                    "Archive limit reached (%s); skipping archive for %s",
                    self._max_archives_per_run,
                    msg_id,
                )
        elif category == "promotions":
            _maybe_add("promotions")
            if self._archives_this_run < self._max_archives_per_run:
                self._gmail_client.archive_message(account, msg_id)
                self._archives_this_run += 1
            else:
                logger.warning(
                    "Archive limit reached (%s); skipping archive for %s",
                    self._max_archives_per_run,
                    msg_id,
                )
        elif category == "personal":
            _maybe_add("personal")
        elif category == "spam":
            # Respect spam mark rate limit, using Gmail's built-in SPAM label.
            if self._spam_marks_this_run < self._max_spam_marks_per_run:
                spam_id = labels_map.get("SPAM")
                if spam_id:
                    add_ids.append(spam_id)
                self._spam_marks_this_run += 1
            else:
                logger.warning(
                    "Spam mark limit reached (%s); skipping spam label for %s",
                    self._max_spam_marks_per_run,
                    msg_id,
                )

        if add_ids:
            self._gmail_client.apply_labels(
                account, msg_id, labels_to_add=add_ids, labels_to_remove=None
            )
