from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.utils import parseaddr

from .ai_classifier import ClassificationError, Classifier, OpenAIClassifier
from .config import (
    get_archive_receipts,
    get_max_archives_per_run,
    get_max_label_actions_per_run,
    get_max_spam_marks_per_run,
    get_safe_sender_domains,
    get_safe_senders,
)
from .persistence import (
    RunJobRepository,
    SupabaseAccountRepository,
    SupabaseProcessedEmailRepository,
    repository_context,
)
from .gmail_client import GmailApiError, GmailAuthError, GmailClient, SafeGmailClient
from .models import Account

logger = logging.getLogger(__name__)


def _sender_for_storage(sender: str | None) -> str:
    """Persist a non-empty sender for history/undo UX; Gmail may omit From on some payloads."""
    s = (sender or "").strip()
    return s if s else "Unknown sender"


def _actions_taken_for_storage(category: str, summary: AppliedActionSummary) -> str:
    """Avoid blank history when MailPilot applied no labels/archive but still recorded the row."""
    t = (summary.actions_taken or "").strip()
    if t:
        return t
    return f"Processed as {category}; no MailPilot Gmail changes applied"


@dataclass
class AppliedActionSummary:
    """What MailPilot changed in Gmail for one message (for history / undo)."""

    actions_taken: str
    was_archived: bool
    label_names: list[str]


@dataclass
class RunResult:
    """Summary of a single run for user feedback."""

    accounts_processed: int
    candidates: int
    processed: int
    labels_applied: int
    archived: int
    spam_marked: int
    dry_run: bool
    accounts_needing_reauth: list[str] = field(default_factory=list)


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
        run_job_id: int | None = None,
        run_job_repo: RunJobRepository | None = None,
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
        self._candidates_this_run = 0
        self._messages_processed_this_run = 0
        self._dry_run = False
        self._search_query = search_query
        self._archive_receipts = get_archive_receipts()
        # Preload safe sender configuration from environment.
        self._safe_sender_domains = set(get_safe_sender_domains())
        self._safe_senders = set(get_safe_senders())
        self._accounts_needing_reauth: list[str] = []
        self._run_job_id = run_job_id
        self._run_job_repo = run_job_repo

    def _report_progress(self, phase: str, message: str) -> None:
        if self._run_job_id is None or self._run_job_repo is None:
            return
        try:
            self._run_job_repo.update_job_progress(self._run_job_id, phase, message)
        except Exception:
            logger.debug("run_jobs progress update failed", exc_info=True)

    def _record_reauth_skip(self, account: Account) -> None:
        if account.email not in self._accounts_needing_reauth:
            self._accounts_needing_reauth.append(account.email)
        logger.error(
            "%s — skipping this account until the user reconnects Gmail in the MailPilot web app.",
            account.email,
        )

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

    def _persist_refreshed_tokens(self, account_repo: SupabaseAccountRepository) -> None:
        """Save any OAuth tokens that were auto-refreshed during this run."""
        getter = getattr(self._gmail_client, "get_refreshed_tokens", None)
        if getter is None:
            return
        refreshed = getter()
        for account_id, new_token_json in refreshed.items():
            account = account_repo.get_by_id(account_id)
            if account:
                account_repo.update_token(account_id, new_token_json)
                logger.info(
                    "Persisted refreshed OAuth token for account %s",
                    account.email,
                )

    def process_all_accounts_once(self, user_id: str | None = None) -> RunResult:
        # Reset per-run counters for rate limiting and stats
        self._archives_this_run = 0
        self._spam_marks_this_run = 0
        self._label_actions_this_run = 0
        self._candidates_this_run = 0
        self._messages_processed_this_run = 0
        self._accounts_needing_reauth = []
        with repository_context() as (account_repo, processed_repo):
            accounts = account_repo.list_active(user_id=user_id)
            if not accounts:
                logger.info("No active accounts configured")
                return RunResult(
                    accounts_processed=0,
                    candidates=0,
                    processed=0,
                    labels_applied=0,
                    archived=0,
                    spam_marked=0,
                    dry_run=self._dry_run,
                    accounts_needing_reauth=[],
                )

            self._report_progress(
                "accounts",
                f"Syncing {len(accounts)} account(s)…",
            )

            for account in accounts:
                self._process_account(account, processed_repo)

            self._persist_refreshed_tokens(account_repo)

        return RunResult(
            accounts_processed=len(accounts),
            candidates=self._candidates_this_run,
            processed=self._messages_processed_this_run,
            labels_applied=self._label_actions_this_run,
            archived=self._archives_this_run,
            spam_marked=self._spam_marks_this_run,
            dry_run=self._dry_run,
            accounts_needing_reauth=list(self._accounts_needing_reauth),
        )

    def _process_account(
        self,
        account: Account,
        processed_repo: SupabaseProcessedEmailRepository,
    ) -> None:
        logger.info("Processing account %s", account.email)
        self._report_progress("fetching", f"Opening {account.email}…")

        labels_map: dict[str, str] = {}
        if not self._dry_run:
            self._report_progress("setup", f"Ensuring MailPilot labels for {account.email}…")
            try:
                labels_map = self._gmail_client.ensure_labels(account)
            except GmailAuthError as exc:
                logger.error("Gmail sign-in required for %s: %s", account.email, exc)
                self._record_reauth_skip(account)
                return
            except GmailApiError as exc:
                logger.error(
                    "Failed to ensure labels for account %s; skipping account this run: %s",
                    account.email,
                    exc,
                )
                return
        inbox_label = "INBOX"

        try:
            message_ids = self._gmail_client.list_messages(
                account,
                label_ids=[inbox_label],
                query=self._search_query,
                max_results=100,
            )
        except GmailAuthError as exc:
            logger.error("Gmail sign-in required for %s: %s", account.email, exc)
            self._record_reauth_skip(account)
            return
        except GmailApiError as exc:
            logger.error(
                "Failed to list messages for account %s; skipping account this run: %s",
                account.email,
                exc,
            )
            return
        self._candidates_this_run += len(message_ids)
        new_count = sum(
            1 for mid in message_ids if not processed_repo.is_processed(account.id, mid)
        )
        logger.info(
            "Found %d candidate message(s) for %s; %d new (not yet processed)",
            len(message_ids),
            account.email,
            new_count,
        )
        self._report_progress(
            "analyzing",
            f"{len(message_ids)} inbox message(s), {new_count} new — classifying for {account.email}…",
        )

        handled_new = 0
        for message_id in message_ids:
            if processed_repo.is_processed(account.id, message_id):
                continue

            try:
                msg = self._gmail_client.get_message(account, message_id)
            except GmailAuthError as exc:
                logger.error("Gmail sign-in required for %s: %s", account.email, exc)
                self._record_reauth_skip(account)
                break
            except GmailApiError as exc:
                logger.error(
                    "Failed to fetch message %s for account %s; skipping message: %s",
                    message_id,
                    account.email,
                    exc,
                )
                continue
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
                self._messages_processed_this_run += 1
                handled_new += 1
                if handled_new % 7 == 0:
                    self._report_progress(
                        "processing",
                        f"Processed {handled_new} new message(s) for {account.email}…",
                    )
                logger.info(
                    "DRY-RUN: would classify message %s for %s as %s",
                    msg.id,
                    account.email,
                    classification.category,
                )
                continue

            msg_received: datetime | None = None
            internal_ms = getattr(msg, "internal_date_ms", None)
            if internal_ms is not None:
                msg_received = datetime.fromtimestamp(internal_ms / 1000.0, tz=UTC)

            try:
                pe = processed_repo.mark_processed(
                    user_id=account.user_id,
                    account_id=account.id,
                    gmail_message_id=msg.id,
                    category=classification.category,
                    subject=msg.subject,
                    gmail_thread_id=msg.thread_id,
                    raw_labels=",".join(msg.labels) if msg.labels else None,
                    sender=_sender_for_storage(msg.sender),
                    message_received_at=msg_received,
                )
            except Exception as exc:
                logger.error(
                    "Failed to persist processed email %s for account %s; skipping actions: %s",
                    msg.id,
                    account.email,
                    exc,
                )
                continue

            try:
                summary = self._apply_actions(
                    account=account,
                    msg_id=msg.id,
                    labels_map=labels_map,
                    category=classification.category,
                    is_safe_sender=is_safe,
                    noise_type=classification.noise_type,
                )
            except GmailAuthError as exc:
                logger.error("Gmail sign-in required for %s: %s", account.email, exc)
                self._record_reauth_skip(account)
                break
            applied_json = json.dumps(summary.label_names) if summary.label_names else None
            processed_repo.update_action_metadata(
                pe.id,
                _actions_taken_for_storage(classification.category, summary),
                summary.was_archived,
                applied_json,
            )
            self._messages_processed_this_run += 1
            handled_new += 1
            if handled_new % 7 == 0:
                self._report_progress(
                    "labels",
                    f"Applied actions for {handled_new} message(s) on {account.email}…",
                )

        self._report_progress(
            "account_done",
            f"Finished {account.email} ({handled_new} new message(s) this run).",
        )

    def _summarize_actions(self, undo_names: set[str], was_archived: bool) -> str:
        parts: list[str] = []
        if was_archived:
            parts.append("Archived")
        non_spam = sorted(n for n in undo_names if n != "SPAM")
        if non_spam:
            parts.append("Labeled: " + ", ".join(non_spam))
        if "SPAM" in undo_names:
            parts.append("Marked spam")
        return "; ".join(parts)

    def _apply_actions(
        self,
        account: Account,
        msg_id: str,
        labels_map: dict[str, str],
        category: str,
        is_safe_sender: bool,
        noise_type: str | None = None,
    ) -> AppliedActionSummary:
        add_ids: list[str] = []
        add_names: list[str] = []
        undo_names: set[str] = set()
        was_archived = False

        if self._dry_run:
            logger.info(
                "DRY-RUN: would apply actions for message %s in account %s with category %s",
                msg_id,
                account.email,
                category,
            )
            return AppliedActionSummary("", False, [])

        if self._label_actions_this_run >= self._max_label_actions_per_run:
            logger.warning(
                "Label action limit reached (%s); skipping actions for message %s",
                self._max_label_actions_per_run,
                msg_id,
            )
            return AppliedActionSummary("", False, [])

        def _maybe_add(label_name: str) -> None:
            lid = labels_map.get(label_name)
            if lid:
                add_ids.append(lid)
                add_names.append(label_name)

        if category == "important":
            _maybe_add("mailpilot/important")
            self._gmail_client.flag_important(account, msg_id)
            undo_names.update(["IMPORTANT", "mailpilot/important"])
        elif category == "work":
            _maybe_add("work")
        elif category == "receipts":
            _maybe_add("receipts")
            if (
                self._archive_receipts
                and not is_safe_sender
                and self._archives_this_run < self._max_archives_per_run
            ):
                self._gmail_client.archive_message(account, msg_id)
                self._archives_this_run += 1
                was_archived = True
        elif category == "newsletters":
            _maybe_add("newsletters")
            if noise_type == "security":
                _maybe_add("security")
            if is_safe_sender:
                logger.info(
                    "Safe sender newsletter %s; skipping archive",
                    msg_id,
                )
            elif self._archives_this_run < self._max_archives_per_run:
                self._gmail_client.archive_message(account, msg_id)
                self._archives_this_run += 1
                was_archived = True
            else:
                logger.warning(
                    "Archive limit reached (%s); skipping archive for %s",
                    self._max_archives_per_run,
                    msg_id,
                )
        elif category == "promotions":
            _maybe_add("promotions")
            if is_safe_sender:
                logger.info(
                    "Safe sender promotion %s; skipping archive",
                    msg_id,
                )
            elif self._archives_this_run < self._max_archives_per_run:
                self._gmail_client.archive_message(account, msg_id)
                self._archives_this_run += 1
                was_archived = True
            else:
                logger.warning(
                    "Archive limit reached (%s); skipping archive for %s",
                    self._max_archives_per_run,
                    msg_id,
                )
        elif category == "personal":
            _maybe_add("personal")
        elif category == "spam":
            if is_safe_sender:
                logger.info(
                    "Safe sender message %s classified as spam; skipping spam label due to safety rules",
                    msg_id,
                )
            elif self._spam_marks_this_run < self._max_spam_marks_per_run:
                spam_id = labels_map.get("SPAM")
                if spam_id:
                    add_ids.append(spam_id)
                    add_names.append("SPAM")
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
                return AppliedActionSummary(
                    self._summarize_actions(undo_names, was_archived),
                    was_archived,
                    sorted(undo_names),
                )
            self._gmail_client.apply_labels(
                account, msg_id, labels_to_add=add_ids, labels_to_remove=None
            )
            self._label_actions_this_run = projected
            undo_names.update(add_names)

        text = self._summarize_actions(undo_names, was_archived)
        return AppliedActionSummary(text, was_archived, sorted(undo_names))
