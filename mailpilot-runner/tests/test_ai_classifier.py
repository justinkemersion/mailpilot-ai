from types import SimpleNamespace

from mailpilot.ai_classifier import OpenAIClassifier


class DummyRateLimitError(Exception):
    def __init__(self, retry_after: str | None = None) -> None:
        super().__init__("429 Too Many Requests")
        self.status_code = 429
        headers = {}
        if retry_after is not None:
            headers["retry-after"] = retry_after
        self.response = SimpleNamespace(headers=headers)


def _response_with_text(text: str):
    return SimpleNamespace(
        output=[
            SimpleNamespace(
                content=[SimpleNamespace(text=text)],
            )
        ]
    )


class RetryTwiceResponsesClient:
    def __init__(self) -> None:
        self.calls = 0
        self.responses = self
        self.last_kwargs = None

    def create(self, **kwargs):
        self.last_kwargs = kwargs
        self.calls += 1
        if self.calls < 3:
            raise DummyRateLimitError("0")
        return _response_with_text(
            '{"category":"personal","noise":false,"noise_type":"","confidence":0.7,"reason":"human"}'
        )


class SuccessfulResponsesClient:
    def __init__(self) -> None:
        self.calls = 0
        self.responses = self
        self.last_kwargs = None

    def create(self, **kwargs):
        self.last_kwargs = kwargs
        self.calls += 1
        return _response_with_text(
            '{"category":"personal","noise":false,"noise_type":"","confidence":0.9,"reason":"human"}'
        )


def test_classifier_retries_rate_limits(monkeypatch):
    monkeypatch.setenv("MAILPILOT_OPENAI_MAX_RETRIES", "2")
    monkeypatch.setenv("MAILPILOT_OPENAI_RETRY_BASE_MS", "1")
    monkeypatch.setenv("MAILPILOT_CLASSIFICATION_DELAY_MS", "0")

    sleeps: list[float] = []
    monkeypatch.setattr("mailpilot.ai_classifier.time.sleep", sleeps.append)

    client = RetryTwiceResponsesClient()
    classifier = OpenAIClassifier(client=client)

    result = classifier.classify(
        subject="Hello",
        sender="person@example.com",
        body="Checking in",
        snippet="Checking in",
    )

    assert client.calls == 3
    assert result.category == "personal"
    assert len(sleeps) == 2


def test_classifier_spaces_requests(monkeypatch):
    monkeypatch.setenv("MAILPILOT_CLASSIFICATION_DELAY_MS", "100")
    monkeypatch.setenv("MAILPILOT_OPENAI_MAX_RETRIES", "0")

    now = {"value": 0.0}
    sleeps: list[float] = []

    def fake_monotonic():
        return now["value"]

    def fake_sleep(seconds: float):
        sleeps.append(seconds)
        now["value"] += seconds

    monkeypatch.setattr("mailpilot.ai_classifier.time.monotonic", fake_monotonic)
    monkeypatch.setattr("mailpilot.ai_classifier.time.sleep", fake_sleep)

    client = SuccessfulResponsesClient()
    classifier = OpenAIClassifier(client=client)

    classifier.classify(
        subject="Hello",
        sender="person@example.com",
        body="Checking in",
        snippet="Checking in",
    )
    classifier.classify(
        subject="Hello again",
        sender="person@example.com",
        body="Checking in",
        snippet="Checking in",
    )

    assert client.calls == 2
    assert sleeps == [0.1]


def test_classifier_uses_configured_context_limits(monkeypatch):
    monkeypatch.setenv("MAILPILOT_CLASSIFICATION_DELAY_MS", "0")
    monkeypatch.setenv("MAILPILOT_OPENAI_MAX_RETRIES", "0")
    monkeypatch.setenv("MAILPILOT_AI_MAX_SUBJECT_CHARS", "5")
    monkeypatch.setenv("MAILPILOT_AI_MAX_SNIPPET_CHARS", "4")
    monkeypatch.setenv("MAILPILOT_AI_MAX_BODY_CHARS", "3")

    client = SuccessfulResponsesClient()
    classifier = OpenAIClassifier(client=client)

    classifier.classify(
        subject="Subject line",
        sender="person@example.com",
        body="abcdefg",
        snippet="Snippet",
    )

    assert client.last_kwargs is not None
    payload = client.last_kwargs["input"]
    assert '"subject": "Subje"' in payload
    assert '"snippet": "Snip"' in payload
    assert '"body": "abc"' in payload


def test_classifier_can_omit_body_for_frugal_mode(monkeypatch):
    monkeypatch.setenv("MAILPILOT_CLASSIFICATION_DELAY_MS", "0")
    monkeypatch.setenv("MAILPILOT_OPENAI_MAX_RETRIES", "0")
    monkeypatch.setenv("MAILPILOT_AI_MAX_BODY_CHARS", "0")

    client = SuccessfulResponsesClient()
    classifier = OpenAIClassifier(client=client)

    classifier.classify(
        subject="Hello",
        sender="person@example.com",
        body="This should be omitted",
        snippet="Keep me",
    )

    assert client.last_kwargs is not None
    payload = client.last_kwargs["input"]
    assert '"body"' not in payload
    assert '"snippet": "Keep me"' in payload
