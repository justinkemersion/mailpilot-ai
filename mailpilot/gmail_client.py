from __future__ import annotations

import base64
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple, TypeVar

from google.auth.exceptions import RefreshError
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials

from .config import load_config
from .database import AccountRepository, connection_ctx, get_connection
from .models import Account


logger = logging.getLogger(__name__)

# The only scope MailPilot needs: read + labels/archive/important.
SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]

REQUIRED_LABEL_NAMES = [
    "work",
    "receipts",
    "newsletters",
    "promotions",
    "personal",
    "mailpilot/important",
    "security",
]


class GmailApiError(RuntimeError):
    """Raised when a Gmail API operation fails."""


class GmailAuthError(GmailApiError):
    """
    Raised when stored Gmail OAuth credentials cannot be used (expired refresh
    token, revoked consent, etc.). User should run add-account again.
    """


REAUTH_USER_HINT = (
    "Re-authenticate with: python -m mailpilot.main add-account "
    "(sign in again for that Gmail address). "
    "OAuth clients in Google 'Testing' mode often require weekly re-consent."
)


def _http_error_requires_reauth(exc: HttpError) -> bool:
    status = getattr(exc.resp, "status", None)
    if status is None:
        return False
    if status == 401:
        return True
    if status == 403:
        try:
            raw = getattr(exc, "content", b"") or b""
            text = raw.decode("utf-8", errors="replace").lower()
            if "invalid_grant" in text or "invalid_credentials" in text:
                return True
            if "token" in text and ("expired" in text or "revoked" in text):
                return True
        except Exception:
            return False
    return False


_T = TypeVar("_T")


def add_account_via_oauth() -> None:
    """
    Run the installed-app OAuth flow and persist a new Gmail account.
    """
    config = load_config()
    if not config.gmail_credentials_file or not config.gmail_credentials_file.exists():
        raise RuntimeError(
            "GOOGLE_CREDENTIALS_FILE must point to a valid OAuth client secrets JSON."
        )

    flow = InstalledAppFlow.from_client_secrets_file(
        str(config.gmail_credentials_file),
        scopes=SCOPES,
    )
    print(
        "Gmail OAuth: the only scope needed is https://www.googleapis.com/auth/gmail.modify "
        "(set this under your OAuth client in Google Cloud Console if prompted)."
    )
    creds = flow.run_local_server(port=0)

    try:
        service = build("gmail", "v1", credentials=creds)
        profile = service.users().getProfile(userId="me").execute()
    except RefreshError as exc:
        raise GmailAuthError(
            f"Gmail rejected the new OAuth session after sign-in. {REAUTH_USER_HINT}"
        ) from exc
    except HttpError as exc:
        if _http_error_requires_reauth(exc):
            raise GmailAuthError(
                f"Gmail rejected credentials right after OAuth. {REAUTH_USER_HINT}"
            ) from exc
        raise GmailApiError(f"Failed to fetch Gmail profile during OAuth setup: {exc}") from exc
    email_address = profile.get("emailAddress")

    token_json = creds.to_json()

    with connection_ctx() as conn:
        repo = AccountRepository(conn)
        account = repo.add_or_update(
            email=email_address,
            token_json=token_json,
            display_name=email_address,
        )
        logger.info("Added/updated Gmail account: %s (id=%s)", account.email, account.id)


def _build_credentials(account: Account) -> Credentials:
    info = json.loads(account.token_json)
    return Credentials.from_authorized_user_info(info, scopes=SCOPES)


def _build_service(account: Account) -> Tuple[Any, Credentials]:
    """Build a Gmail API service, returning (service, credentials)."""
    creds = _build_credentials(account)
    service: Any = build("gmail", "v1", credentials=creds, cache_discovery=False)
    return service, creds


@dataclass
class GmailMessage:
    id: str
    thread_id: Optional[str]
    subject: Optional[str]
    sender: Optional[str]
    snippet: Optional[str]
    body: Optional[str]
    labels: List[str]


class GmailClient:
    """
    Facade over Gmail API for MailPilot.
    """

    def __init__(self) -> None:
        self._label_cache: Dict[Tuple[int, str], str] = {}
        self._service_cache: Dict[int, Any] = {}
        self._creds_cache: Dict[int, Tuple[Credentials, str]] = {}

    def _clear_account_session(self, account_id: int) -> None:
        """Drop cached Google client so the next call rebuilds credentials."""
        self._service_cache.pop(account_id, None)
        self._creds_cache.pop(account_id, None)
        stale = [k for k in self._label_cache if k[0] == account_id]
        for key in stale:
            del self._label_cache[key]

    def _run_gmail(
        self,
        account: Account,
        action_desc: str,
        call: Callable[[], _T],
    ) -> _T:
        try:
            return call()
        except RefreshError as exc:
            self._clear_account_session(account.id)
            raise GmailAuthError(
                f"{account.email}: Gmail OAuth token could not be refreshed. {REAUTH_USER_HINT}"
            ) from exc
        except HttpError as exc:
            if _http_error_requires_reauth(exc):
                self._clear_account_session(account.id)
                raise GmailAuthError(
                    f"{account.email}: Gmail rejected the saved sign-in "
                    f"(HTTP {getattr(exc.resp, 'status', '?')}). {REAUTH_USER_HINT}"
                ) from exc
            raise GmailApiError(f"{action_desc} for {account.email}: {exc}") from exc

    def _get_service(self, account: Account) -> Any:
        """Return a cached Gmail API service for the given account."""
        if account.id not in self._service_cache:
            service, creds = _build_service(account)
            self._service_cache[account.id] = service
            self._creds_cache[account.id] = (creds, account.token_json)
        return self._service_cache[account.id]

    def get_refreshed_tokens(self) -> Dict[int, str]:
        """
        Return {account_id: new_token_json} for any credentials that were
        refreshed since the service was built. Call after a processing run
        to persist updated tokens.
        """
        updated: Dict[int, str] = {}
        for account_id, (creds, original_json) in self._creds_cache.items():
            current_json = creds.to_json()
            if current_json != original_json:
                updated[account_id] = current_json
        return updated

    def ensure_labels(self, account: Account) -> Dict[str, str]:
        """
        Ensure required labels exist for the account, returning name -> id mapping.
        """
        service = self._get_service(account)
        labels_resource = service.users().labels()
        existing = self._run_gmail(
            account,
            "list labels",
            lambda: labels_resource.list(userId="me").execute().get("labels", []),
        )
        name_to_id = {lbl["name"]: lbl["id"] for lbl in existing}

        for name in REQUIRED_LABEL_NAMES:
            if name not in name_to_id:
                body = {"name": name, "labelListVisibility": "labelShow"}

                def _create(b: dict[str, str] = body) -> dict[str, Any]:
                    return labels_resource.create(userId="me", body=b).execute()

                created = self._run_gmail(
                    account,
                    f"create label '{name}'",
                    _create,
                )
                name_to_id[name] = created["id"]
                logger.info("Created label %s for account %s", name, account.email)

        for name, lid in name_to_id.items():
            self._label_cache[(account.id, name)] = lid

        return name_to_id

    def list_messages(
        self,
        account: Account,
        label_ids: Optional[List[str]] = None,
        query: Optional[str] = None,
        max_results: int = 100,
    ) -> List[str]:
        service = self._get_service(account)
        kwargs = {"userId": "me", "maxResults": max_results}
        if label_ids:
            kwargs["labelIds"] = label_ids
        if query:
            kwargs["q"] = query

        response = self._run_gmail(
            account,
            "list messages",
            lambda: service.users().messages().list(**kwargs).execute(),
        )

        messages = response.get("messages", [])
        return [m["id"] for m in messages]

    def get_message(self, account: Account, message_id: str) -> GmailMessage:
        service = self._get_service(account)
        msg = self._run_gmail(
            account,
            f"fetch message {message_id}",
            lambda: service.users()
            .messages()
            .get(userId="me", id=message_id, format="full")
            .execute(),
        )

        headers = {h["name"].lower(): h["value"] for h in msg["payload"].get("headers", [])}
        subject = headers.get("subject")
        sender = headers.get("from")
        snippet = msg.get("snippet")
        labels = msg.get("labelIds", [])
        body = _extract_body(msg.get("payload", {}))

        return GmailMessage(
            id=msg["id"],
            thread_id=msg.get("threadId"),
            subject=subject,
            sender=sender,
            snippet=snippet,
            body=body,
            labels=labels,
        )

    def apply_labels(
        self,
        account: Account,
        message_id: str,
        labels_to_add: Optional[List[str]] = None,
        labels_to_remove: Optional[List[str]] = None,
    ) -> None:
        service = self._get_service(account)
        modify_body: Dict[str, List[str]] = {}
        if labels_to_add:
            modify_body["addLabelIds"] = labels_to_add
        if labels_to_remove:
            modify_body["removeLabelIds"] = labels_to_remove

        if not modify_body:
            return

        try:
            self._run_gmail(
                account,
                f"modify labels for message {message_id}",
                lambda: service.users()
                .messages()
                .modify(userId="me", id=message_id, body=modify_body)
                .execute(),
            )
        except GmailAuthError:
            raise
        except GmailApiError as exc:
            logger.error(
                "Failed to modify labels for message %s account %s: %s",
                message_id,
                account.email,
                exc,
            )

    def archive_message(self, account: Account, message_id: str) -> None:
        self.apply_labels(account, message_id, labels_to_add=None, labels_to_remove=["INBOX"])

    def flag_important(self, account: Account, message_id: str) -> None:
        """
        Apply both Gmail IMPORTANT and mailpilot/important labels, using
        the label cache populated by ensure_labels when available.
        """
        label_ids: List[str] = []
        important_id = self._label_cache.get((account.id, "IMPORTANT"))
        if important_id:
            label_ids.append(important_id)
        mp_important_id = self._label_cache.get((account.id, "mailpilot/important"))
        if mp_important_id:
            label_ids.append(mp_important_id)

        if not label_ids:
            # Cache miss — fall back to an API call (first run or cache cleared).
            service = self._get_service(account)
            labels = self._run_gmail(
                account,
                "list labels for important flag",
                lambda: service.users().labels().list(userId="me").execute().get("labels", []),
            )
            name_to_id = {lbl["name"]: lbl["id"] for lbl in labels}
            for name, lid in name_to_id.items():
                self._label_cache[(account.id, name)] = lid
            if "IMPORTANT" in name_to_id:
                label_ids.append(name_to_id["IMPORTANT"])
            if "mailpilot/important" in name_to_id:
                label_ids.append(name_to_id["mailpilot/important"])

        if label_ids:
            self.apply_labels(account, message_id, labels_to_add=label_ids, labels_to_remove=None)


class ForbiddenGmailActionError(RuntimeError):
    """
    Raised when MailPilot code attempts a disallowed Gmail operation
    such as delete or trash.
    """


class SafeGmailClient:
    """
    Safety wrapper around GmailClient that enforces an explicit allowlist
    of Gmail operations and rejects destructive actions like delete/trash.
    """

    def __init__(self, inner: GmailClient) -> None:
        self._inner = inner

    # Allowed operations (forwarded directly)

    def ensure_labels(self, account: Account) -> Dict[str, str]:
        return self._inner.ensure_labels(account)

    def list_messages(
        self,
        account: Account,
        label_ids: Optional[List[str]] = None,
        query: Optional[str] = None,
        max_results: int = 100,
    ) -> List[str]:
        return self._inner.list_messages(account, label_ids=label_ids, query=query, max_results=max_results)

    def get_message(self, account: Account, message_id: str) -> GmailMessage:
        return self._inner.get_message(account, message_id)

    def apply_labels(
        self,
        account: Account,
        message_id: str,
        labels_to_add: Optional[List[str]] = None,
        labels_to_remove: Optional[List[str]] = None,
    ) -> None:
        self._inner.apply_labels(account, message_id, labels_to_add=labels_to_add, labels_to_remove=labels_to_remove)

    def archive_message(self, account: Account, message_id: str) -> None:
        self._inner.archive_message(account, message_id)

    def flag_important(self, account: Account, message_id: str) -> None:
        self._inner.flag_important(account, message_id)

    def get_refreshed_tokens(self) -> Dict[int, str]:
        getter = getattr(self._inner, "get_refreshed_tokens", None)
        return getter() if getter else {}

    # Explicitly forbidden operations

    def delete_message(self, *args, **kwargs) -> None:
        raise ForbiddenGmailActionError(
            "MailPilot safety guardrail: deleting Gmail messages is not allowed."
        )

    def trash_message(self, *args, **kwargs) -> None:
        raise ForbiddenGmailActionError(
            "MailPilot safety guardrail: moving Gmail messages to trash is not allowed."
        )

    def batch_delete_messages(self, *args, **kwargs) -> None:
        raise ForbiddenGmailActionError(
            "MailPilot safety guardrail: batch deletion of Gmail messages is not allowed."
        )


def _extract_body(payload: dict) -> Optional[str]:
    """
    Extract a best-effort text body from a Gmail message payload,
    recursing into nested multipart structures (e.g. multipart/mixed
    containing multipart/alternative).
    """

    def _decode_part(part: dict) -> Optional[str]:
        data = part.get("body", {}).get("data")
        if not data:
            return None
        decoded_bytes = base64.urlsafe_b64decode(data.encode("utf-8"))
        return decoded_bytes.decode("utf-8", errors="ignore")

    def _collect_parts(node: dict) -> List[dict]:
        """Flatten all leaf parts from a potentially nested multipart tree."""
        if "parts" in node:
            result: List[dict] = []
            for child in node["parts"]:
                result.extend(_collect_parts(child))
            return result
        return [node]

    parts = _collect_parts(payload)

    for part in parts:
        if part.get("mimeType", "") == "text/plain":
            text = _decode_part(part)
            if text:
                return text

    for part in parts:
        if part.get("mimeType", "") == "text/html":
            text = _decode_part(part)
            if text:
                return text

    return None
