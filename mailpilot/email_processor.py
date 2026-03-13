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
    ) -> None:
        self._gmail_client = gmail_client or GmailClient()
        self._classifier = classifier or OpenAIClassifier()

    def process_all_accounts_once(self) -> None:
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

        labels_map = self._gmail_client.ensure_labels(account)
        inbox_label = "INBOX"

        message_ids = self._gmail_client.list_messages(
            account,
            label_ids=[inbox_label],
            query="is:unread",
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
            self._gmail_client.archive_message(account, msg_id)
        elif category == "promotions":
            _maybe_add("promotions")
            self._gmail_client.archive_message(account, msg_id)
        elif category == "personal":
            _maybe_add("personal")
        elif category == "spam":
            _maybe_add("spam")

        if add_ids:
            self._gmail_client.apply_labels(account, msg_id, labels_to_add=add_ids, labels_to_remove=None)
