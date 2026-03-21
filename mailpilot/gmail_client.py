from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

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

    service = build("gmail", "v1", credentials=creds)
    profile = service.users().getProfile(userId="me").execute()
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


def _build_service(account: Account):
    creds = _build_credentials(account)
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


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

    def ensure_labels(self, account: Account) -> Dict[str, str]:
        """
        Ensure required labels exist for the account, returning name -> id mapping.
        """
        service = _build_service(account)
        labels_resource = service.users().labels()
        existing = labels_resource.list(userId="me").execute().get("labels", [])
        name_to_id = {lbl["name"]: lbl["id"] for lbl in existing}

        for name in REQUIRED_LABEL_NAMES:
            if name not in name_to_id:
                body = {"name": name, "labelListVisibility": "labelShow"}
                created = labels_resource.create(userId="me", body=body).execute()
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
        service = _build_service(account)
        kwargs = {"userId": "me", "maxResults": max_results}
        if label_ids:
            kwargs["labelIds"] = label_ids
        if query:
            kwargs["q"] = query

        try:
            response = service.users().messages().list(**kwargs).execute()
        except HttpError as exc:
            logger.error("Error listing messages for %s: %s", account.email, exc)
            return []

        messages = response.get("messages", [])
        return [m["id"] for m in messages]

    def get_message(self, account: Account, message_id: str) -> GmailMessage:
        service = _build_service(account)
        msg = (
            service.users()
            .messages()
            .get(userId="me", id=message_id, format="full")
            .execute()
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
        service = _build_service(account)
        modify_body: Dict[str, List[str]] = {}
        if labels_to_add:
            modify_body["addLabelIds"] = labels_to_add
        if labels_to_remove:
            modify_body["removeLabelIds"] = labels_to_remove

        if not modify_body:
            return

        try:
            service.users().messages().modify(
                userId="me", id=message_id, body=modify_body
            ).execute()
        except HttpError as exc:
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
        Apply both Gmail IMPORTANT and mailpilot/important labels, if available.
        """
        service = _build_service(account)
        labels = service.users().labels().list(userId="me").execute().get("labels", [])
        name_to_id = {lbl["name"]: lbl["id"] for lbl in labels}
        label_ids: List[str] = []
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
    Extract a best-effort text body from a Gmail message payload.
    """

    def _decode_part(part: dict) -> Optional[str]:
        data = part.get("body", {}).get("data")
        if not data:
            return None
        decoded_bytes = base64.urlsafe_b64decode(data.encode("utf-8"))
        return decoded_bytes.decode("utf-8", errors="ignore")

    if "parts" in payload:
        for part in payload["parts"]:
            mime_type = part.get("mimeType", "")
            if mime_type == "text/plain":
                text = _decode_part(part)
                if text:
                    return text
        for part in payload["parts"]:
            mime_type = part.get("mimeType", "")
            if mime_type == "text/html":
                text = _decode_part(part)
                if text:
                    return text
    else:
        return _decode_part(payload)

    return None
