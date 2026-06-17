"""Append-only audit rows in mail_action_log."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from .category_seeds import SEED_BY_SLUG
from .models import Account
from .preference_matcher import MailPreference
from .security_hard_stops import HardStopMatch

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProcessedEmailLogContext:
    processed_email_id: int
    gmail_message_id: str
    gmail_thread_id: str | None
    category_id: int | None
    resolution_status: str | None
    inbox_status: str | None
    was_archived: bool
    actions_taken: str | None
    proposed_action: str | None
    subject: str | None
    sender: str | None


class ActionLogRepository:
    def __init__(self, client: object) -> None:
        self._client = client

    def insert_row(self, row: dict[str, Any]) -> None:
        self._client.table("mail_action_log").insert(row).execute()

    def log_archive_blocked(
        self,
        *,
        account: Account,
        context: ProcessedEmailLogContext,
        preference: MailPreference,
        hard_stop: HardStopMatch,
        category: str,
    ) -> None:
        seed = SEED_BY_SLUG.get(category)
        safety_tier = seed.safety_tier if seed else "review"
        self.insert_row(
            {
                "user_id": account.user_id,
                "account_id": account.id,
                "processed_email_id": context.processed_email_id,
                "gmail_message_id": context.gmail_message_id,
                "gmail_thread_id": context.gmail_thread_id,
                "category_id": context.category_id,
                "preference_id": preference.id,
                "action_taken": "archive_blocked",
                "reason_json": {
                    "account_email": account.email,
                    "account_purpose": account.purpose,
                    "category_slug": category,
                    "matched_preference_id": preference.id,
                    "intended_policy": preference.action_policy,
                    "policy_applied": "never_archive",
                    "safety_tier": safety_tier,
                    "confidence": None,
                    "hard_stop_checked": True,
                    "block_reason": hard_stop.block_reason,
                    "summary": (
                        "Matched your taught archive rule, but did not archive because "
                        f"{hard_stop.summary.removeprefix('Hard stop: ')}"
                    ),
                },
                "previous_state_json": {
                    "resolution_status": context.resolution_status,
                    "inbox_status": context.inbox_status,
                    "was_archived": context.was_archived,
                    "actions_taken": context.actions_taken,
                    "proposed_action": context.proposed_action,
                    "subject": context.subject,
                    "sender": context.sender,
                },
            }
        )

    def try_log_auto_archive(
        self,
        *,
        account: Account,
        context: ProcessedEmailLogContext,
        preference: MailPreference,
        category: str,
    ) -> bool:
        seed = SEED_BY_SLUG.get(category)
        safety_tier = seed.safety_tier if seed else "review"
        try:
            self.insert_row(
                {
                    "user_id": account.user_id,
                    "account_id": account.id,
                    "processed_email_id": context.processed_email_id,
                    "gmail_message_id": context.gmail_message_id,
                    "gmail_thread_id": context.gmail_thread_id,
                    "category_id": context.category_id,
                    "preference_id": preference.id,
                    "action_taken": "archive",
                    "reason_json": {
                        "account_email": account.email,
                        "account_purpose": account.purpose,
                        "category_slug": category,
                        "matched_preference_id": preference.id,
                        "policy_applied": "archive",
                        "safety_tier": safety_tier,
                        "confidence": None,
                        "hard_stop_checked": True,
                        "summary": (
                            "Archived automatically after your approved mailbox rule matched."
                        ),
                    },
                    "previous_state_json": {
                        "resolution_status": context.resolution_status,
                        "inbox_status": context.inbox_status,
                        "was_archived": context.was_archived,
                        "actions_taken": context.actions_taken,
                        "proposed_action": context.proposed_action,
                        "subject": context.subject,
                        "sender": context.sender,
                    },
                }
            )
            return True
        except Exception:
            logger.exception(
                "Failed to write auto-archive action log for message %s",
                context.gmail_message_id,
            )
            return False
