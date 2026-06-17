from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.utils import parseaddr
from typing import Any

from .ai_classifier import (
    AiLimitExceededError,
    ClassificationError,
    ClassifiedEmail,
    Classifier,
    create_classifier,
)
from .config import (
    get_archive_policy_env_snapshot,
    get_archive_receipts,
    get_classifier_info,
    get_gmail_max_messages_per_account,
    get_legacy_auto_archive,
    get_max_archives_per_run,
    get_max_classifications_per_account,
    get_max_classifications_per_run,
    get_max_dry_run_classifications,
    get_max_label_actions_per_run,
    get_max_spam_marks_per_run,
    get_processing_claim_ttl_seconds,
    get_safe_sender_domains,
    get_safe_senders,
)
from .policy_resolver import (
    ResolvedPolicy,
    build_policy_preview,
    resolve_policy,
    resolution_status_for,
    should_archive,
)
from .action_logger import ActionLogRepository, ProcessedEmailLogContext
from .persistence import (
    MailPreferenceRepository,
    RunJobRepository,
    SupabaseAccountRepository,
    SupabaseProcessedEmailRepository,
    repository_context,
)
from .preference_matcher import MailPreference, find_matching_preference
from .security_hard_stops import check_hard_stop
from .gmail_client import GmailApiError, GmailAuthError, GmailClient, SafeGmailClient
from .models import Account

logger = logging.getLogger(__name__)

_RECEIPT_PRIMARY_RE = re.compile(
    r"\b(receipt|invoice|order confirmation|payment received|transaction confirmation|your order)\b"
)
_RECEIPT_SUPPORT_RE = re.compile(
    r"\b(order number|tracking number|billing|subtotal|payment method|charged to|amount due)\b"
)
_NEWSLETTER_RE = re.compile(
    r"\b(unsubscribe|manage preferences|email preferences|view in browser|newsletter)\b"
)
_PROMOTION_RE = re.compile(
    r"\b(% off|discount|coupon|limited time|shop now|deal|sale ends|special offer)\b"
)


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


def _merge_limits(*limits: int) -> int:
    finite = [limit for limit in limits if limit >= 0]
    if not finite:
        return -1
    return min(finite)


def _normalize_message_text(
    subject: str | None,
    sender: str | None,
    snippet: str | None,
    body: str | None,
) -> str:
    parts = [
        (subject or "").lower(),
        (sender or "").lower(),
        (snippet or "").lower(),
        (body or "")[:2000].lower(),
    ]
    return "\n".join(part for part in parts if part)


def _is_automated_sender(sender: str | None) -> bool:
    sender_text = (sender or "").lower()
    return any(token in sender_text for token in ("no-reply", "noreply", "do-not-reply"))


def _rule_based_classification(
    subject: str | None,
    sender: str | None,
    snippet: str | None,
    body: str | None,
) -> ClassifiedEmail | None:
    text = _normalize_message_text(subject, sender, snippet, body)

    if _RECEIPT_PRIMARY_RE.search(text) and (
        _RECEIPT_SUPPORT_RE.search(text) or _is_automated_sender(sender)
    ):
        reason = "Rule-based receipt shortcut"
        return ClassifiedEmail(
            category="receipts",
            confidence=0.99,
            rationale=reason,
            noise=True,
            noise_type="receipt",
            reason=reason,
        )

    if _NEWSLETTER_RE.search(text) and _PROMOTION_RE.search(text):
        reason = "Rule-based promotion shortcut"
        return ClassifiedEmail(
            category="promotions",
            confidence=0.98,
            rationale=reason,
            noise=True,
            noise_type="promotion",
            reason=reason,
        )

    if _NEWSLETTER_RE.search(text):
        reason = "Rule-based newsletter shortcut"
        return ClassifiedEmail(
            category="newsletters",
            confidence=0.98,
            rationale=reason,
            noise=True,
            noise_type="newsletter",
            reason=reason,
        )

    return None


@dataclass
class AppliedActionSummary:
    """What MailPilot changed in Gmail for one message (for history / undo)."""

    actions_taken: str
    was_archived: bool
    label_names: list[str]
    proposed_action: str = "keep_inbox"
    resolution_status: str = "kept"


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
    llm_calls: int = 0
    prefiltered: int = 0
    skipped_by_budget: int = 0
    skipped_by_claim_conflict: int = 0
    skipped_by_ai_limit: int = 0
    ai_limit_hit: bool = False
    ai_limit_message: str | None = None
    accounts_needing_reauth: list[str] = field(default_factory=list)
    ai_provider: str = ""
    ai_model: str = ""
    ai_label: str = ""
    labeled_not_archived_by_category: dict[str, int] = field(default_factory=dict)
    archive_policy_env: dict[str, bool | int] = field(default_factory=dict)
    policy_previews: list[dict[str, str]] = field(default_factory=list)


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
        self._classifier = classifier or create_classifier()
        self._max_archives_per_run = (
            max_archives_per_run if max_archives_per_run is not None else get_max_archives_per_run()
        )
        self._max_spam_marks_per_run = (
            max_spam_marks_per_run if max_spam_marks_per_run is not None else get_max_spam_marks_per_run()
        )
        self._max_label_actions_per_run = get_max_label_actions_per_run()
        self._max_classifications_per_run = get_max_classifications_per_run()
        self._max_classifications_per_account = get_max_classifications_per_account()
        self._max_dry_run_classifications = get_max_dry_run_classifications()
        self._gmail_max_messages_per_account = get_gmail_max_messages_per_account()
        self._processing_claim_ttl_seconds = get_processing_claim_ttl_seconds()
        self._archives_this_run = 0
        self._spam_marks_this_run = 0
        self._label_actions_this_run = 0
        self._candidates_this_run = 0
        self._messages_processed_this_run = 0
        self._classifications_this_run = 0
        self._prefiltered_this_run = 0
        self._skipped_by_budget_this_run = 0
        self._skipped_by_claim_conflict_this_run = 0
        self._skipped_by_ai_limit_this_run = 0
        self._dry_run = False
        self._search_query = search_query
        self._archive_receipts = get_archive_receipts()
        self._legacy_auto_archive = get_legacy_auto_archive()
        # Preload safe sender configuration from environment.
        self._safe_sender_domains = set(get_safe_sender_domains())
        self._safe_senders = set(get_safe_senders())
        self._accounts_needing_reauth: list[str] = []
        self._run_budget_hit = False
        self._ai_limit_hit = False
        self._ai_limit_message: str | None = None
        self._account_budget_hits_reported: set[str] = set()
        self._labeled_not_archived_by_category: dict[str, int] = {}
        self._policy_previews: list[dict[str, str]] = []
        self._run_job_id = run_job_id
        self._run_job_repo = run_job_repo
        classifier_info = get_classifier_info()
        self._ai_provider = classifier_info["ai_provider"]
        self._ai_model = classifier_info["ai_model"]
        self._ai_label = classifier_info["ai_label"]
        if run_job_id is not None and run_job_repo is not None:
            self._report_progress("classifier", f"AI classifier: {self._ai_label}")

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

    def _effective_run_classification_limit(self) -> int:
        if not self._dry_run:
            return self._max_classifications_per_run
        return _merge_limits(
            self._max_classifications_per_run,
            self._max_dry_run_classifications,
        )

    def _record_ai_limit_hit(self, exc: AiLimitExceededError) -> None:
        if self._ai_limit_hit:
            return
        self._ai_limit_hit = True
        self._ai_limit_message = str(exc)
        logger.warning("AI provider limit reached: %s", exc)
        self._report_progress("ai_limit", str(exc))

    def _classification_budget_scope(self, account: Account, account_calls: int) -> str | None:
        if self._ai_limit_hit:
            return "ai_limit"

        run_limit = self._effective_run_classification_limit()
        if run_limit >= 0 and self._classifications_this_run >= run_limit:
            if not self._run_budget_hit:
                self._run_budget_hit = True
                logger.warning(
                    "LLM classification budget reached for this run (%s); remaining messages will be skipped",
                    run_limit,
                )
                self._report_progress(
                    "throttled",
                    f"Reached LLM request budget for this run ({run_limit}); remaining messages will be skipped.",
                )
            return "run"

        account_limit = self._max_classifications_per_account
        if self._dry_run:
            account_limit = _merge_limits(account_limit, self._max_dry_run_classifications)
        if account_limit >= 0 and account_calls >= account_limit:
            if account.email not in self._account_budget_hits_reported:
                self._account_budget_hits_reported.add(account.email)
                logger.warning(
                    "LLM classification budget reached for account %s (%s)",
                    account.email,
                    account_limit,
                )
                self._report_progress(
                    "throttled",
                    f"Reached per-account LLM budget for {account.email} ({account_limit}); moving on.",
                )
            return "account"

        return None

    def _classify_message(
        self,
        account: Account,
        msg: Any,
        account_calls: int,
    ) -> tuple[ClassifiedEmail | None, int, str | None]:
        shortcut = _rule_based_classification(
            subject=getattr(msg, "subject", None),
            sender=getattr(msg, "sender", None),
            snippet=getattr(msg, "snippet", None),
            body=getattr(msg, "body", None),
        )
        if shortcut is not None:
            self._prefiltered_this_run += 1
            return shortcut, account_calls, None

        budget_scope = self._classification_budget_scope(account, account_calls)
        if budget_scope is not None:
            if budget_scope == "ai_limit":
                self._skipped_by_ai_limit_this_run += 1
            else:
                self._skipped_by_budget_this_run += 1
            return None, account_calls, budget_scope

        try:
            classification = self._classifier.classify(
                subject=msg.subject,
                sender=msg.sender,
                body=msg.body,
                snippet=msg.snippet,
            )
        except AiLimitExceededError as exc:
            self._record_ai_limit_hit(exc)
            self._skipped_by_ai_limit_this_run += 1
            return None, account_calls, "ai_limit"

        self._classifications_this_run += 1
        return classification, account_calls + 1, None

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
        self._classifications_this_run = 0
        self._prefiltered_this_run = 0
        self._skipped_by_budget_this_run = 0
        self._skipped_by_claim_conflict_this_run = 0
        self._skipped_by_ai_limit_this_run = 0
        self._accounts_needing_reauth = []
        self._run_budget_hit = False
        self._ai_limit_hit = False
        self._ai_limit_message = None
        self._account_budget_hits_reported = set()
        self._labeled_not_archived_by_category = {}
        self._policy_previews = []
        archive_policy_env = get_archive_policy_env_snapshot()
        logger.info("Archive policy env snapshot: %s", archive_policy_env)
        with repository_context() as (account_repo, processed_repo):
            preference_repo = MailPreferenceRepository(processed_repo._client)
            action_log_repo = ActionLogRepository(processed_repo._client)
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
                    llm_calls=0,
                    prefiltered=0,
                    skipped_by_budget=0,
                    skipped_by_claim_conflict=0,
                    skipped_by_ai_limit=0,
                    ai_limit_hit=False,
                    ai_limit_message=None,
                    accounts_needing_reauth=[],
                    ai_provider=self._ai_provider,
                    ai_model=self._ai_model,
                    ai_label=self._ai_label,
                    labeled_not_archived_by_category={},
                    archive_policy_env=archive_policy_env,
                    policy_previews=[],
                )

            self._report_progress(
                "accounts",
                f"Syncing {len(accounts)} account(s)…",
            )

            for account in accounts:
                scope = self._classification_budget_scope(account, 0)
                if scope in ("run", "ai_limit"):
                    break
                self._process_account(
                    account, processed_repo, preference_repo, action_log_repo
                )

            self._persist_refreshed_tokens(account_repo)

        return RunResult(
            accounts_processed=len(accounts),
            candidates=self._candidates_this_run,
            processed=self._messages_processed_this_run,
            labels_applied=self._label_actions_this_run,
            archived=self._archives_this_run,
            spam_marked=self._spam_marks_this_run,
            dry_run=self._dry_run,
            llm_calls=self._classifications_this_run,
            prefiltered=self._prefiltered_this_run,
            skipped_by_budget=self._skipped_by_budget_this_run,
            skipped_by_claim_conflict=self._skipped_by_claim_conflict_this_run,
            skipped_by_ai_limit=self._skipped_by_ai_limit_this_run,
            ai_limit_hit=self._ai_limit_hit,
            ai_limit_message=self._ai_limit_message,
            accounts_needing_reauth=list(self._accounts_needing_reauth),
            ai_provider=self._ai_provider,
            ai_model=self._ai_model,
            ai_label=self._ai_label,
            labeled_not_archived_by_category=dict(self._labeled_not_archived_by_category),
            archive_policy_env=archive_policy_env,
            policy_previews=list(self._policy_previews),
        )

    def _record_policy_preview(
        self, account: Account, category: str, is_safe_sender: bool
    ) -> None:
        preview = build_policy_preview(
            category,
            account,
            is_safe_sender=is_safe_sender,
            archive_receipts=self._archive_receipts,
            legacy_auto_archive=self._legacy_auto_archive,
        )
        if preview is not None:
            self._policy_previews.append(preview.as_dict())
            logger.info(
                "Policy preview %s @ %s: current=%s new=%s (%s)",
                category,
                account.email,
                preview.current_behavior,
                preview.new_policy,
                preview.reason,
            )

    def _record_labeled_not_archived(self, category: str, summary: AppliedActionSummary) -> None:
        if summary.was_archived or not summary.label_names:
            return
        self._labeled_not_archived_by_category[category] = (
            self._labeled_not_archived_by_category.get(category, 0) + 1
        )

    def _process_account(
        self,
        account: Account,
        processed_repo: SupabaseProcessedEmailRepository,
        preference_repo: MailPreferenceRepository | None = None,
        action_log_repo: ActionLogRepository | None = None,
    ) -> None:
        logger.info(
            "Processing account %s (purpose=%s, security_posture=%s)",
            account.email,
            account.purpose,
            account.security_posture,
        )
        self._report_progress("fetching", f"Opening {account.email}…")

        account_preferences = (
            preference_repo.list_enabled(account.id) if preference_repo else []
        )

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
                max_results=self._gmail_max_messages_per_account,
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
        account_llm_calls = 0
        for message_id in message_ids:
            claimed = processed_repo.try_claim_processing(
                user_id=account.user_id,
                account_id=account.id,
                gmail_message_id=message_id,
                ttl_seconds=self._processing_claim_ttl_seconds,
            )
            if not claimed:
                self._skipped_by_claim_conflict_this_run += 1
                continue

            try:
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
                    classification, account_llm_calls, budget_scope = self._classify_message(
                        account, msg, account_llm_calls
                    )
                except ClassificationError as exc:
                    logger.error(
                        "Classification failed for message %s in account %s; skipping message: %s",
                        msg.id,
                        account.email,
                        exc,
                    )
                    continue

                if budget_scope is not None:
                    break
                if classification is None:
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
                    self._record_policy_preview(account, classification.category, is_safe)
                    stored_sender = _sender_for_storage(msg.sender)
                    matched_pref = find_matching_preference(
                        account_preferences,
                        category=classification.category,
                        subject=msg.subject,
                        sender=stored_sender,
                    )
                    hard_stop = check_hard_stop(msg.subject, stored_sender)
                    archive_blocked = (
                        matched_pref is not None
                        and matched_pref.action_policy == "archive"
                        and hard_stop is not None
                    )
                    log_context = ProcessedEmailLogContext(
                        processed_email_id=pe.id,
                        gmail_message_id=msg.id,
                        gmail_thread_id=msg.thread_id,
                        category_id=None,
                        resolution_status="unresolved",
                        inbox_status="in_inbox",
                        was_archived=False,
                        actions_taken=None,
                        proposed_action=None,
                        subject=msg.subject,
                        sender=stored_sender,
                    )
                    if archive_blocked and action_log_repo is not None and matched_pref:
                        action_log_repo.log_archive_blocked(
                            account=account,
                            context=log_context,
                            preference=matched_pref,
                            hard_stop=hard_stop,
                            category=classification.category,
                        )
                    resolved = resolve_policy(
                        classification.category,
                        account,
                        matched_preference=matched_pref,
                        hard_stop=hard_stop,
                    )
                    summary = self._apply_actions(
                        account=account,
                        msg_id=msg.id,
                        labels_map=labels_map,
                        category=classification.category,
                        is_safe_sender=is_safe,
                        resolved=resolved,
                        archive_blocked=archive_blocked,
                        matched_preference=matched_pref,
                        action_log_repo=action_log_repo,
                        log_context=log_context,
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
                    proposed_action=summary.proposed_action,
                    resolution_status=summary.resolution_status,
                    inbox_status="archived" if summary.was_archived else "in_inbox",
                )
                self._record_labeled_not_archived(classification.category, summary)
                self._messages_processed_this_run += 1
                handled_new += 1
                if handled_new % 7 == 0:
                    self._report_progress(
                        "labels",
                        f"Applied actions for {handled_new} message(s) on {account.email}…",
                    )
            finally:
                processed_repo.release_processing_claim(account.id, message_id)

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
        resolved: ResolvedPolicy,
        *,
        archive_blocked: bool = False,
        matched_preference: MailPreference | None = None,
        action_log_repo: ActionLogRepository | None = None,
        log_context: ProcessedEmailLogContext | None = None,
        noise_type: str | None = None,
    ) -> AppliedActionSummary:
        add_ids: list[str] = []
        add_names: list[str] = []
        undo_names: set[str] = set()
        was_archived = False
        want_archive = should_archive(
            resolved,
            category,
            matched_preference=matched_preference,
            is_safe_sender=is_safe_sender,
            archive_receipts=self._archive_receipts,
            legacy_auto_archive=self._legacy_auto_archive,
        )

        if self._dry_run:
            logger.info(
                "DRY-RUN: would apply actions for message %s in account %s "
                "category=%s policy=%s archive=%s",
                msg_id,
                account.email,
                category,
                resolved.action,
                want_archive,
            )
            return AppliedActionSummary(
                "",
                False,
                [],
                proposed_action=resolved.action,
                resolution_status=resolution_status_for(
                    resolved, was_archived=False, archive_blocked=archive_blocked
                ),
            )

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

        def _maybe_archive() -> None:
            nonlocal was_archived
            if is_safe_sender:
                logger.info(
                    "Safe sender %s; skipping archive for message %s",
                    category,
                    msg_id,
                )
                return
            if not want_archive:
                return
            if self._archives_this_run >= self._max_archives_per_run:
                logger.warning(
                    "Archive limit reached (%s); skipping archive for %s",
                    self._max_archives_per_run,
                    msg_id,
                )
                return
            preference_archive = (
                matched_preference is not None
                and matched_preference.action_policy == "archive"
            )
            if preference_archive:
                if action_log_repo is None or log_context is None:
                    logger.warning(
                        "Fail closed: skipping preference archive for %s (no action log)",
                        msg_id,
                    )
                    return
                if not action_log_repo.try_log_auto_archive(
                    account=account,
                    context=log_context,
                    preference=matched_preference,
                    category=category,
                ):
                    logger.warning(
                        "Fail closed: skipping preference archive for %s (log write failed)",
                        msg_id,
                    )
                    return
            self._gmail_client.archive_message(account, msg_id)
            self._archives_this_run += 1
            was_archived = True

        if category == "important":
            _maybe_add("mailpilot/important")
            self._gmail_client.flag_important(account, msg_id)
            undo_names.update(["IMPORTANT", "mailpilot/important"])
        elif category == "work":
            _maybe_add("work")
        elif category == "receipts":
            _maybe_add("receipts")
            _maybe_archive()
        elif category == "newsletters":
            _maybe_add("newsletters")
            if noise_type == "security":
                _maybe_add("security")
            _maybe_archive()
        elif category == "promotions":
            _maybe_add("promotions")
            _maybe_archive()
        elif category == "personal":
            _maybe_add("personal")
        elif category == "work_device_sign_in":
            _maybe_add("security/work-device-sign-in")
            _maybe_archive()
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
                    proposed_action=resolved.action,
                    resolution_status=resolution_status_for(
                        resolved, was_archived=was_archived, archive_blocked=archive_blocked
                    ),
                )
            self._gmail_client.apply_labels(
                account, msg_id, labels_to_add=add_ids, labels_to_remove=None
            )
            self._label_actions_this_run = projected
            undo_names.update(add_names)

        text = self._summarize_actions(undo_names, was_archived)
        return AppliedActionSummary(
            text,
            was_archived,
            sorted(undo_names),
            proposed_action=resolved.action,
            resolution_status=resolution_status_for(
                resolved, was_archived=was_archived, archive_blocked=archive_blocked
            ),
        )
