from dataclasses import dataclass

from mailpilot.email_processor import EmailProcessor
from mailpilot.models import Account


@dataclass
class DummyClassification:
    category: str
    confidence: float | None = None
    rationale: str | None = None


class DummyClassifier:
    def __init__(self, category: str) -> None:
        self._category = category

    def classify(self, subject, sender, body, snippet):
        return DummyClassification(category=self._category)


class DummyGmailClient:
    def __init__(self) -> None:
        self.applied = []
        self.archived = []
        self.flagged = []

    def apply_labels(self, account, message_id, labels_to_add=None, labels_to_remove=None):
        self.applied.append(
            {
                "account": account.email,
                "id": message_id,
                "add": labels_to_add or [],
                "remove": labels_to_remove or [],
            }
        )

    def archive_message(self, account, message_id):
        self.archived.append((account.email, message_id))

    def flag_important(self, account, message_id):
        self.flagged.append((account.email, message_id))


def _dummy_account() -> Account:
    from datetime import datetime, timezone

    return Account(
        id=1,
        email="user@example.com",
        display_name=None,
        token_json="{}",
        active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


def test_apply_actions_for_newsletters_archives_and_labels():
    dummy_gmail = DummyGmailClient()
    processor = EmailProcessor(gmail_client=dummy_gmail, classifier=DummyClassifier("newsletters"))
    account = _dummy_account()

    labels_map = {"newsletters": "LBL_NEWS"}

    processor._apply_actions(  # type: ignore[attr-defined]
        account=account,
        msg_id="msg-1",
        labels_map=labels_map,
        category="newsletters",
        is_safe_sender=False,
    )

    assert dummy_gmail.archived == [(account.email, "msg-1")]
    assert any("LBL_NEWS" in call["add"] for call in dummy_gmail.applied)


def test_apply_actions_for_important_flags_and_labels():
    dummy_gmail = DummyGmailClient()
    processor = EmailProcessor(gmail_client=dummy_gmail, classifier=DummyClassifier("important"))
    account = _dummy_account()

    labels_map = {"mailpilot/important": "LBL_MP_IMP"}

    processor._apply_actions(  # type: ignore[attr-defined]
        account=account,
        msg_id="msg-2",
        labels_map=labels_map,
        category="important",
        is_safe_sender=False,
    )

    assert dummy_gmail.flagged == [(account.email, "msg-2")]
    assert any("LBL_MP_IMP" in call["add"] for call in dummy_gmail.applied)

