import pytest

from mailpilot.ai_classifier import ClassificationError, OpenAIClassifier


def test_classifier_interface_smoke():
    """
    Smoke-test that the classifier exposes the expected interface
    and returns a valid category when the OpenAI client is mocked.
    """

    class DummyResponse:
        def __init__(self):
            class OutputItem:
                class ContentItem:
                    text = '{"category": "work", "confidence": 0.9, "rationale": "Test"}'

                content = [ContentItem()]

            self.output = [OutputItem()]

    class DummyClient:
        class Responses:
            def create(self, *args, **kwargs):  # type: ignore[override]
                return DummyResponse()

        def __init__(self) -> None:
            self.responses = self.Responses()

    # Inject dummy client so no real API calls or config are needed
    classifier = OpenAIClassifier(client=DummyClient())

    result = classifier.classify(
        subject="Test subject",
        sender="test@example.com",
        body="Body",
        snippet="Snippet",
    )

    assert result.category == "work"
    assert result.noise is False
    assert result.noise_type is None
    assert result.reason == "Test"


def test_classifier_noise_schema():
    """New schema: noise=true and noise_type map to internal category."""

    class DummyResponse:
        def __init__(self, text: str):
            class ContentItem:
                pass

            ContentItem.text = text
            class OutputItem:
                content = [ContentItem()]

            self.output = [OutputItem()]

    class DummyClient:
        def __init__(self, response_text: str) -> None:
            self._text = response_text

        @property
        def responses(self):
            text = self._text

            class R:
                def create(self, *args, **kwargs):  # type: ignore[override]
                    return DummyResponse(text)

            return R()

    # Noise newsletter -> category newsletters
    client = DummyClient(
        '{"category": "newsletters", "noise": true, "noise_type": "newsletter", '
        '"confidence": 0.95, "reason": "Opt-in digest"}'
    )
    classifier = OpenAIClassifier(client=client)
    result = classifier.classify(subject="Daily digest", sender="noreply@blog.com", body="", snippet="")
    assert result.noise is True
    assert result.noise_type == "newsletter"
    assert result.category == "newsletters"
    assert result.reason == "Opt-in digest"

    # Noise receipt -> category receipts
    client2 = DummyClient(
        '{"category": "receipts", "noise": true, "noise_type": "receipt", '
        '"confidence": 1.0, "reason": "Order confirmation"}'
    )
    classifier2 = OpenAIClassifier(client=client2)
    result2 = classifier2.classify(subject="Your order", sender="orders@store.com", body="", snippet="")
    assert result2.noise is True
    assert result2.noise_type == "receipt"
    assert result2.category == "receipts"

    # Noise security -> category important (kept visible)
    client3 = DummyClient(
        '{"category": "important", "noise": true, "noise_type": "security", '
        '"confidence": 0.9, "reason": "Login alert"}'
    )
    classifier3 = OpenAIClassifier(client=client3)
    result3 = classifier3.classify(subject="New sign-in", sender="no-reply@google.com", body="", snippet="")
    assert result3.noise is True
    assert result3.noise_type == "security"
    assert result3.category == "important"


def test_classifier_parse_failure_logs_no_raw_payload(caplog):
    class DummyResponse:
        def __init__(self):
            class OutputItem:
                class ContentItem:
                    text = "this is not json and contains SECRET_TOKEN_12345"

                content = [ContentItem()]

            self.output = [OutputItem()]

    class DummyClient:
        class Responses:
            def create(self, *args, **kwargs):  # type: ignore[override]
                return DummyResponse()

        def __init__(self) -> None:
            self.responses = self.Responses()

    classifier = OpenAIClassifier(client=DummyClient())
    with pytest.raises(ClassificationError):
        classifier.classify(
            subject="Test subject",
            sender="test@example.com",
            body="Body",
            snippet="Snippet",
        )

    assert "SECRET_TOKEN_12345" not in caplog.text
