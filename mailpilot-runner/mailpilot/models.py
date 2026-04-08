from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass
class Account:
    id: int
    user_id: str
    email: str
    display_name: str | None
    token_json: str
    active: bool
    created_at: datetime
    updated_at: datetime
    processing_enabled: bool = True


@dataclass
class ProcessedEmail:
    id: int
    user_id: str
    account_id: int
    gmail_message_id: str
    gmail_thread_id: str | None
    category: str
    subject: str | None
    processed_at: datetime
    message_received_at: datetime | None
    raw_labels: str | None
    sender: str | None
    actions_taken: str | None
    was_archived: bool
    applied_label_names: str | None
