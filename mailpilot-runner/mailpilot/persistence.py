from __future__ import annotations

import logging
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any, Iterator

from typing import TYPE_CHECKING

from .config import create_db_client, flux_configured, load_config, load_supabase_credentials

if TYPE_CHECKING:
    from supabase import Client
from .models import Account, ProcessedEmail

logger = logging.getLogger(__name__)


def check_supabase_connection() -> tuple[bool, str]:
    """
    Verify we can reach the configured database and see expected tables.

    Returns (ok, message). Uses Flux when Flux credentials are configured.
    """
    try:
        client = create_db_client()
    except RuntimeError as exc:
        return False, str(exc)

    backend = "Flux" if flux_configured() else "Supabase"
    try:
        acc = client.table("accounts").select("id").limit(1).execute()
        _ = acc.data
        pe = client.table("processed_emails").select("id").limit(1).execute()
        _ = pe.data
    except Exception as exc:  # noqa: BLE001 — surface any client/network error
        return False, f"{backend} request failed: {exc}"
    return True, f"{backend} OK: connected and tables reachable."


def _parse_dt(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    s = str(value).replace("Z", "+00:00")
    return datetime.fromisoformat(s)


def _iso_now() -> str:
    return datetime.now(UTC).isoformat()


def _is_unique_violation(exc: Exception) -> bool:
    text = str(exc).lower()
    return (
        "23505" in text
        or "duplicate key value violates unique constraint" in text
        or "conflict" in text
        or "409" in text
    )


class SupabaseAccountRepository:
    def __init__(self, client: object) -> None:
        self._client = client

    def get_by_id(self, account_id: int) -> Account | None:
        res = (
            self._client.table("accounts")
            .select("*")
            .eq("id", account_id)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        return self._row_to_account(rows[0]) if rows else None

    def get_by_email(self, email: str) -> Account | None:
        res = (
            self._client.table("accounts")
            .select("*")
            .eq("email", email)
            .eq("active", True)
            .order("id")
            .limit(1)
            .execute()
        )
        rows = res.data or []
        return self._row_to_account(rows[0]) if rows else None

    def update_token(self, account_id: int, token_json: str) -> None:
        self._client.table("accounts").update(
            {"token_json": token_json, "updated_at": _iso_now()}
        ).eq("id", account_id).execute()

    def list_active(self, user_id: str | None = None) -> list[Account]:
        q = (
            self._client.table("accounts")
            .select("*")
            .eq("active", True)
            .eq("processing_enabled", True)
        )
        if user_id is not None:
            q = q.eq("user_id", user_id)
        res = q.order("email").execute()
        return [self._row_to_account(r) for r in (res.data or [])]

    @staticmethod
    def _row_to_account(row: dict[str, Any]) -> Account:
        return Account(
            id=int(row["id"]),
            user_id=str(row["user_id"]),
            email=str(row["email"]),
            display_name=row.get("display_name"),
            token_json=str(row["token_json"]),
            active=bool(row.get("active", True)),
            created_at=_parse_dt(row.get("created_at")),
            updated_at=_parse_dt(row.get("updated_at")),
            processing_enabled=bool(row.get("processing_enabled", True)),
            purpose=str(row.get("purpose") or "other"),
            default_archive_policy=str(row.get("default_archive_policy") or "ask_first"),
            security_posture=str(row.get("security_posture") or "standard"),
            scope_configured_at=_parse_dt(row["scope_configured_at"])
            if row.get("scope_configured_at")
            else None,
        )


class MailPreferenceRepository:
    def __init__(self, client: object) -> None:
        self._client = client

    def list_enabled(self, account_id: int) -> list:
        from .preference_matcher import MailPreference

        res = (
            self._client.table("mail_preferences")
            .select("*")
            .eq("account_id", account_id)
            .eq("enabled", True)
            .order("created_at", desc=True)
            .execute()
        )
        out: list[MailPreference] = []
        for row in res.data or []:
            out.append(
                MailPreference(
                    id=int(row["id"]),
                    user_id=str(row["user_id"]),
                    account_id=int(row["account_id"]),
                    match_type=str(row["match_type"]),
                    match_conditions_json=dict(row.get("match_conditions_json") or {}),
                    category_id=int(row["category_id"]) if row.get("category_id") else None,
                    action_policy=str(row["action_policy"]),
                    enabled=bool(row.get("enabled", True)),
                )
            )
        return out


class SupabaseProcessedEmailRepository:
    def __init__(self, client: object) -> None:
        self._client = client

    def _fetch_row_dict(
        self, account_id: int, gmail_message_id: str
    ) -> dict[str, Any] | None:
        res = (
            self._client.table("processed_emails")
            .select("*")
            .eq("account_id", account_id)
            .eq("gmail_message_id", gmail_message_id)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        return rows[0] if rows else None

    def is_processed(self, account_id: int, gmail_message_id: str) -> bool:
        res = (
            self._client.table("processed_emails")
            .select("id")
            .eq("account_id", account_id)
            .eq("gmail_message_id", gmail_message_id)
            .limit(1)
            .execute()
        )
        return bool(res.data)

    def try_claim_processing(
        self,
        *,
        user_id: str,
        account_id: int,
        gmail_message_id: str,
        ttl_seconds: int = 1800,
    ) -> bool:
        stale_before = (datetime.now(UTC) - timedelta(seconds=max(0, ttl_seconds))).isoformat()
        self._client.table("processing_claims").delete().eq("account_id", account_id).eq(
            "gmail_message_id", gmail_message_id
        ).lt("claimed_at", stale_before).execute()

        try:
            self._client.table("processing_claims").insert(
                {
                    "user_id": user_id,
                    "account_id": account_id,
                    "gmail_message_id": gmail_message_id,
                    "claimed_at": _iso_now(),
                }
            ).execute()
            return True
        except Exception as exc:
            if _is_unique_violation(exc):
                return False
            raise

    def release_processing_claim(self, account_id: int, gmail_message_id: str) -> None:
        self._client.table("processing_claims").delete().eq("account_id", account_id).eq(
            "gmail_message_id", gmail_message_id
        ).execute()

    def mark_processed(
        self,
        *,
        user_id: str,
        account_id: int,
        gmail_message_id: str,
        category: str,
        subject: str | None,
        gmail_thread_id: str | None,
        raw_labels: str | None,
        sender: str | None = None,
        actions_taken: str | None = None,
        was_archived: bool = False,
        applied_label_names: str | None = None,
        message_received_at: datetime | None = None,
    ) -> ProcessedEmail:
        existing = self._fetch_row_dict(account_id, gmail_message_id)
        if existing:
            return self._row_to_processed(existing)

        row: dict[str, Any] = {
            "user_id": user_id,
            "account_id": account_id,
            "gmail_message_id": gmail_message_id,
            "gmail_thread_id": gmail_thread_id,
            "category": category,
            "subject": subject,
            "processed_at": _iso_now(),
            "message_received_at": (
                message_received_at.astimezone(UTC).isoformat()
                if message_received_at is not None
                else None
            ),
            "raw_labels": raw_labels,
            "sender": sender,
            "actions_taken": actions_taken,
            "was_archived": was_archived,
            "applied_label_names": applied_label_names,
        }
        # supabase-py 2.x: insert() returns a builder with only .execute() — no .select() chain.
        try:
            self._client.table("processed_emails").insert(row).execute()
        except Exception as exc:
            if _is_unique_violation(exc):
                existing = self._fetch_row_dict(account_id, gmail_message_id)
                if existing:
                    return self._row_to_processed(existing)
            raise

        inserted = self._fetch_row_dict(account_id, gmail_message_id)
        if not inserted:
            logger.error(
                "insert processed_emails succeeded but row missing for account_id=%s message_id=%s",
                account_id,
                gmail_message_id,
            )
            raise RuntimeError("Failed to read processed_emails row after insert")
        return self._row_to_processed(inserted)

    def update_action_metadata(
        self,
        processed_email_id: int,
        actions_taken: str,
        was_archived: bool,
        applied_label_names: str | None,
        *,
        proposed_action: str | None = None,
        resolution_status: str | None = None,
        inbox_status: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "actions_taken": actions_taken,
            "was_archived": was_archived,
            "applied_label_names": applied_label_names,
        }
        if proposed_action is not None:
            payload["proposed_action"] = proposed_action
        if resolution_status is not None:
            payload["resolution_status"] = resolution_status
        if inbox_status is not None:
            payload["inbox_status"] = inbox_status
        self._client.table("processed_emails").update(payload).eq(
            "id", processed_email_id
        ).execute()

    def mark_undone(self, processed_email_id: int) -> None:
        res = (
            self._client.table("processed_emails")
            .select("actions_taken")
            .eq("id", processed_email_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            return
        prev = res.data[0].get("actions_taken") or ""
        new_val = (str(prev).strip() + " [UNDONE]").strip()
        self._client.table("processed_emails").update({"actions_taken": new_val}).eq(
            "id", processed_email_id
        ).execute()

    def _account_email_map(self, account_ids: set[int]) -> dict[int, str]:
        if not account_ids:
            return {}
        out: dict[int, str] = {}
        for aid in sorted(account_ids):
            res = (
                self._client.table("accounts")
                .select("id, email")
                .eq("id", aid)
                .limit(1)
                .execute()
            )
            if res.data:
                out[int(res.data[0]["id"])] = str(res.data[0]["email"])
        return out

    def search_history(
        self,
        *,
        sender: str | None = None,
        subject: str | None = None,
        category: str | None = None,
        days_back: int = 7,
        action: str | None = None,
        limit: int = 50,
        message_id: str | None = None,
        account_email: str | None = None,
    ) -> list[dict[str, Any]]:
        cutoff = (datetime.now(UTC) - timedelta(days=days_back)).isoformat()
        q = self._client.table("processed_emails").select("*").gte("processed_at", cutoff)

        if sender is not None:
            q = q.ilike("sender", f"%{sender}%")
        if subject is not None:
            q = q.ilike("subject", f"%{subject}%")
        if category is not None:
            q = q.eq("category", category)
        if action is not None:
            q = q.ilike("actions_taken", f"%{action}%")
        if message_id is not None:
            q = q.eq("gmail_message_id", message_id)

        fetch_cap = limit * 4 if account_email is not None else limit
        res = q.order("processed_at", desc=True).limit(fetch_cap).execute()
        rows = list(res.data or [])

        if account_email is not None:
            acc_ids = {int(r["account_id"]) for r in rows}
            emap = self._account_email_map(acc_ids)
            rows = [
                r
                for r in rows
                if emap.get(int(r["account_id"]), "").lower() == account_email.lower()
            ][:limit]

        acc_ids = {int(r["account_id"]) for r in rows}
        emap = self._account_email_map(acc_ids)
        out: list[dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            d["account_email"] = emap.get(int(r["account_id"]), "")
            out.append(d)
        return out

    def summarize_recent(self, limit: int = 20) -> list[dict[str, Any]]:
        res = (
            self._client.table("processed_emails")
            .select("*")
            .order("processed_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = res.data or []
        acc_ids = {int(r["account_id"]) for r in rows}
        emap = self._account_email_map(acc_ids)
        return [
            {
                "processed_at": r.get("processed_at"),
                "category": r.get("category"),
                "subject": r.get("subject"),
                "account_email": emap.get(int(r["account_id"]), ""),
            }
            for r in rows
        ]

    @staticmethod
    def _row_to_processed(row: dict[str, Any]) -> ProcessedEmail:
        mra = row.get("message_received_at")
        return ProcessedEmail(
            id=int(row["id"]),
            user_id=str(row["user_id"]),
            account_id=int(row["account_id"]),
            gmail_message_id=str(row["gmail_message_id"]),
            gmail_thread_id=row.get("gmail_thread_id"),
            category=str(row["category"]),
            subject=row.get("subject"),
            processed_at=_parse_dt(row.get("processed_at")),
            message_received_at=_parse_dt(mra) if mra else None,
            raw_labels=row.get("raw_labels"),
            sender=row.get("sender"),
            actions_taken=row.get("actions_taken"),
            was_archived=bool(row.get("was_archived", False)),
            applied_label_names=row.get("applied_label_names"),
        )


class RunJobRepository:
    """
    Manages run_jobs rows — the job queue used by the web app to trigger
    'watch-jobs' runs. The Python runner uses the service role key so it can
    claim and update any pending job regardless of RLS user context.
    """

    def __init__(self, client: object) -> None:
        self._client = client

    def claim_next_pending(self) -> dict[str, Any] | None:
        """
        Atomically claim the oldest pending job via Postgres
        ``FOR UPDATE SKIP LOCKED`` (function ``claim_next_run_job``).
        """
        try:
            res = self._client.rpc("claim_next_run_job", {}).execute()
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "claim_next_run_job RPC failed (did you apply the migration?): %s",
                exc,
            )
            raise

        rows = res.data
        if rows is None:
            return None
        if isinstance(rows, list):
            return rows[0] if rows else None
        return rows  # type: ignore[return-value]

    def reap_stale_running_jobs(self) -> int:
        """
        Mark run_jobs stuck in ``running`` for >15 minutes as failed.
        """
        try:
            res = self._client.rpc("reap_stale_run_jobs", {}).execute()
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "reap_stale_run_jobs RPC failed (did you apply the migration?): %s",
                exc,
            )
            raise

        data = res.data
        if data is None:
            return 0
        if isinstance(data, int):
            return data
        # supabase-py may return scalar as single-element list
        if isinstance(data, list) and len(data) == 1:
            return int(data[0])
        return int(data)

    def update_job_progress(self, job_id: int, phase: str, message: str) -> None:
        payload = {
            "phase": phase,
            "message": message,
            "timestamp": _iso_now(),
        }
        self._client.table("run_jobs").update({"progress": payload}).eq("id", job_id).execute()

    def mark_done(self, job_id: int, result: dict[str, Any]) -> None:
        self._client.table("run_jobs").update(
            {
                "status": "done",
                "result": result,
                "completed_at": _iso_now(),
                "progress": None,
            }
        ).eq("id", job_id).execute()

    def mark_failed(self, job_id: int, error: str) -> None:
        self._client.table("run_jobs").update(
            {
                "status": "failed",
                "error": error,
                "completed_at": _iso_now(),
                "progress": None,
            }
        ).eq("id", job_id).execute()


@contextmanager
def repository_context() -> Iterator[tuple[SupabaseAccountRepository, SupabaseProcessedEmailRepository]]:
    """
    Yields (account_repo, processed_repo) backed by Supabase using the service role key.
    """
    _ = load_config()
    client = create_db_client()
    yield SupabaseAccountRepository(client), SupabaseProcessedEmailRepository(client)
