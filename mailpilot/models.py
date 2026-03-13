from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class Account:
    id: int
    email: str
    display_name: Optional[str]
    token_json: str
    active: bool
    created_at: datetime
    updated_at: datetime


@dataclass
class ProcessedEmail:
    id: int
    account_id: int
    gmail_message_id: str
    gmail_thread_id: Optional[str]
    category: str
    subject: Optional[str]
    processed_at: datetime
    raw_labels: Optional[str]
