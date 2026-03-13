from __future__ import annotations

import logging
from email.utils import parseaddr
from typing import List

from .ai_classifier import ClassificationError, Classifier, OpenAIClassifier
from .config import (
    get_max_archives_per_run,
    get_max_label_actions_per_run,
    get_max_spam_marks_per_run,
    get_safe_sender_domains,
    get_safe_senders,
)
from .database import (
    AccountRepository,
    ProcessedEmailRepository,
    connection_ctx,
)
from .gmail_client import GmailClient, SafeGmailClient
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
        max_archives_per_run: int | None = None,
        max_spam_marks_per_run: int | None = None,
        search_query: str | None = "is:unread",
    ) -> None:
        base_client = gmail_client or GmailClient()
        self._gmail_client = SafeGmailClient(base_client)
        self._classifier = classifier or OpenAIClassifier()
        self._max_archives_per_run = (
            max_archives_per_run if max_archives_per_run is not None else get_max_archives_per_run()
        )
        self._max_spam_marks_per_run = (
            max_spam_marks_per_run if max_spam_marks_per_run is not None else get_max_spam_marks_per_run()
        )
        self._max_label_actions_per_run = get_max_label_actions_per_run()
        self._archives_this_run = 0
        self._spam_marks_this_run = 0
        self._label_actions_this_run = 0
        self._dry_run = False
        self._search_query = search_query
        # Preload safe sender configuration from environment.
        self._safe_sender_domains = set(get_safe_sender_domains())
        self._safe_senders = set(get_safe_senders())

    def _is_safe_sender(self, sender: str | None) -> bool:
        if not sender:
            return False
        # Extract email address from "Name <email@example.com>" style headers.
        _, addr = parseaddr(sender)
        addr = (addr or "").lower()
        if not addr:
            return False
        if addr in self._safe_senders:
            return True
        if "@" in addr:
            domain = addr.split("@", 1)[1]
            if domain in self._safe_sender_domains:
                return True
        return False

    def enable_dry_run(self) -> None:
        """
        Enable dry-run mode, where actions are logged but not sent to Gmail.
        """
        self._dry_run = True

    def process_all_accounts_once(self) -> None:
        # Reset per-run counters for rate limiting
        self._archives_this_run = 0
        self._spam_marks_this_run = 0
        self._label_actions_this_run = 0
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
            is_safe = self._is_safe_sender(msg.sender)
            try:
                classification = self._classifier.classify(
                    subject=msg.subject,
                    sender=msg.sender,
                    body=msg.body,
                    snippet=msg.snippet,
                )
            except ClassificationError as exc:
                logger.error(
                    "Classification failed for message %s in account %s; skipping message: %s",
                    msg.id,
                    account.email,
                    exc,
                )
                continue

            if self._dry_run:
                logger.info(
                    "DRY-RUN: would classify message %s for %s as %s",
                    msg.id,
                    account.email,
                    classification.category,
                )
                continue

            try:
                processed_repo.mark_processed(
                    account_id=account.id,
                    gmail_message_id=msg.id,
                    category=classification.category,
                    subject=msg.subject,
                    gmail_thread_id=msg.thread_id,
                    raw_labels=",".join(msg.labels) if msg.labels else None,
                )
            except Exception as exc:
                logger.error(
                    "Failed to persist processed email %s for account %s; skipping actions: %s",
                    msg.id,
                    account.email,
                    exc,
                )
                continue

            self._apply_actions(
                account=account,
                msg_id=msg.id,
                labels_map=labels_map,
                category=classification.category,
                is_safe_sender=is_safe,
            )

    def _apply_actions(
        self,
        account: Account,
        msg_id: str,
        labels_map: dict[str, str],
        category: str,
        is_safe_sender: bool,
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

        # Global per-run label action safety limit.
        if self._label_actions_this_run >= self._max_label_actions_per_run:
            logger.warning(
                "Label action limit reached (%s); skipping actions for message %s",
                self._max_label_actions_per_run,
                msg_id,
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
            # For safe senders, do not auto-archive newsletters.
            if not is_safe_sender and self._archives_this_run < self._max_archives_per_run:
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
            # For safe senders, do not auto-archive promotions.
            if not is_safe_sender and self._archives_this_run < self._max_archives_per_run:
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
            # For safe senders, NEVER mark as spam.
            if is_safe_sender:
                logger.info(
                    "Safe sender message %s classified as spam; skipping spam label due to safety rules",
                    msg_id,
                )
            elif self._spam_marks_this_run < self._max_spam_marks_per_run:
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
            projected = self._label_actions_this_run + len(add_ids)
            if projected > self._max_label_actions_per_run:
                logger.warning(
                    "Label action limit reached (%s); skipping label changes for message %s",
                    self._max_label_actions_per_run,
                    msg_id,
                )
                return
            self._gmail_client.apply_labels(
                account, msg_id, labels_to_add=add_ids, labels_to_remove=None
            )
            self._label_actions_this_run = projected
