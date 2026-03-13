from mailpilot.ai_classifier import OpenAIClassifier


def test_classifier_interface_smoke(monkeypatch):
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
        def responses(self):  # type: ignore[override]
            return self

        def create(self, *args, **kwargs):  # type: ignore[override]
            return DummyResponse()

    # Patch the internal client
    classifier = OpenAIClassifier()
    classifier._client = DummyClient()  # type: ignore[attr-defined]

    result = classifier.classify(
        subject="Test subject",
        sender="test@example.com",
        body="Body",
        snippet="Snippet",
    )

    assert result.category == "work"
