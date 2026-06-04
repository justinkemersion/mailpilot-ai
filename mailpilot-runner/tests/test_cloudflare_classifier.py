from types import SimpleNamespace

import pytest
import requests

from mailpilot.ai_classifier import (
    AiLimitExceededError,
    CloudflareClassifier,
    ClassificationError,
    create_classifier,
)
from mailpilot.config import load_config


class DummySession:
    def __init__(self, responses: list[tuple[int, dict[str, object]]]) -> None:
        self.responses = list(responses)
        self.calls = 0
        self.last_json: dict[str, object] | None = None
        self.last_url: str | None = None

    def post(self, url, *, headers=None, json=None, timeout=None):
        self.last_url = url
        self.last_json = json
        status, body = self.responses[self.calls]
        self.calls += 1
        response = SimpleNamespace(status_code=status, headers={})
        response.json = lambda: body
        response.raise_for_status = lambda: None
        if status >= 400:
            raise requests.HTTPError(f"{status} error", response=response)
        return response


def test_cloudflare_classifier_parses_json_mode_object(monkeypatch):
    monkeypatch.setenv("MAILPILOT_CLASSIFICATION_DELAY_MS", "0")
    monkeypatch.setenv("MAILPILOT_OPENAI_MAX_RETRIES", "0")

    session = DummySession(
        [
            (
                200,
                {
                    "success": True,
                    "result": {
                        "response": {
                            "category": "newsletters",
                            "noise": True,
                            "noise_type": "newsletter",
                            "confidence": 0.95,
                            "reason": "Bulk newsletter",
                        }
                    },
                },
            )
        ]
    )
    classifier = CloudflareClassifier(
        run_url="https://example.test/ai/run/model",
        api_token="cf-token",
        model="@cf/meta/llama-3.1-8b-instruct-fast",
        session=session,  # type: ignore[arg-type]
    )

    result = classifier.classify(
        subject="Weekly digest",
        sender="news@example.com",
        body="Unsubscribe here",
        snippet="Digest",
    )

    assert result.category == "newsletters"
    assert result.noise is True
    assert session.calls == 1
    assert session.last_json is not None
    assert session.last_json.get("response_format") is not None


def test_cloudflare_classifier_parses_string_json_with_fence(monkeypatch):
    monkeypatch.setenv("MAILPILOT_CLASSIFICATION_DELAY_MS", "0")
    monkeypatch.setenv("MAILPILOT_OPENAI_MAX_RETRIES", "0")

    session = DummySession(
        [
            (
                200,
                {
                    "success": True,
                    "result": {
                        "response": (
                            '```json\n{"category":"personal","noise":false,'
                            '"noise_type":"","confidence":0.8,"reason":"Direct note"}\n```'
                        )
                    },
                },
            )
        ]
    )
    classifier = CloudflareClassifier(
        run_url="https://example.test/ai/run/model",
        api_token="cf-token",
        session=session,  # type: ignore[arg-type]
    )

    result = classifier.classify(
        subject="Coffee tomorrow?",
        sender="friend@example.com",
        body="Are you free?",
        snippet="Are you free?",
    )

    assert result.category == "personal"
    assert result.noise is False


def test_cloudflare_classifier_retries_rate_limits(monkeypatch):
    monkeypatch.setenv("MAILPILOT_CLASSIFICATION_DELAY_MS", "0")
    monkeypatch.setenv("MAILPILOT_OPENAI_MAX_RETRIES", "1")
    monkeypatch.setenv("MAILPILOT_OPENAI_RETRY_BASE_MS", "1")

    sleeps: list[float] = []
    monkeypatch.setattr("mailpilot.ai_classifier.time.sleep", sleeps.append)

    session = DummySession(
        [
            (429, {"success": False, "errors": [{"message": "rate limited"}]}),
            (
                200,
                {
                    "success": True,
                    "result": {
                        "response": {
                            "category": "promotions",
                            "noise": True,
                            "noise_type": "promotion",
                            "confidence": 0.9,
                            "reason": "Marketing",
                        }
                    },
                },
            ),
        ]
    )
    classifier = CloudflareClassifier(
        run_url="https://example.test/ai/run/model",
        api_token="cf-token",
        session=session,  # type: ignore[arg-type]
    )

    result = classifier.classify(
        subject="Sale",
        sender="shop@example.com",
        body="Shop now",
        snippet="Shop now",
    )

    assert result.category == "promotions"
    assert session.calls == 2
    assert len(sleeps) == 1


def test_cloudflare_raises_ai_limit_when_rate_limit_retries_exhausted(monkeypatch):
    monkeypatch.setenv("MAILPILOT_CLASSIFICATION_DELAY_MS", "0")
    monkeypatch.setenv("MAILPILOT_OPENAI_MAX_RETRIES", "0")

    session = DummySession(
        [
            (429, {"success": False, "errors": [{"message": "rate limited"}]}),
        ]
    )
    classifier = CloudflareClassifier(
        run_url="https://example.test/ai/run/model",
        api_token="cf-token",
        session=session,  # type: ignore[arg-type]
    )

    with pytest.raises(AiLimitExceededError) as exc_info:
        classifier.classify(
            subject="Sale",
            sender="shop@example.com",
            body="Shop now",
            snippet="Shop now",
        )

    assert exc_info.value.provider == "cloudflare"
    assert "Cloudflare" in str(exc_info.value)


def test_cloudflare_raises_ai_limit_on_neuron_quota_message(monkeypatch):
    monkeypatch.setenv("MAILPILOT_CLASSIFICATION_DELAY_MS", "0")
    monkeypatch.setenv("MAILPILOT_OPENAI_MAX_RETRIES", "0")

    session = DummySession(
        [
            (
                200,
                {
                    "success": False,
                    "errors": [{"message": "Daily neuron limit exceeded"}],
                },
            ),
        ]
    )
    classifier = CloudflareClassifier(
        run_url="https://example.test/ai/run/model",
        api_token="cf-token",
        session=session,  # type: ignore[arg-type]
    )

    with pytest.raises(AiLimitExceededError):
        classifier.classify(
            subject="Sale",
            sender="shop@example.com",
            body="Shop now",
            snippet="Shop now",
        )


def test_create_classifier_selects_cloudflare(monkeypatch):
    monkeypatch.setenv("MAILPILOT_AI_PROVIDER", "cloudflare")
    monkeypatch.setenv("MAILPILOT_CLOUDFLARE_ACCOUNT_ID", "acct123")
    monkeypatch.setenv("MAILPILOT_CLOUDFLARE_API_TOKEN", "cf-token")

    classifier = create_classifier()
    assert isinstance(classifier, CloudflareClassifier)


def test_load_config_allows_cloudflare_without_openai(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("MAILPILOT_AI_PROVIDER", "cloudflare")
    monkeypatch.setenv("MAILPILOT_CLOUDFLARE_ACCOUNT_ID", "acct123")
    monkeypatch.setenv("MAILPILOT_CLOUDFLARE_API_TOKEN", "cf-token")
    monkeypatch.setenv("FLUX_API_URL", "https://api.example.test")
    monkeypatch.setenv("FLUX_SERVICE_TOKEN", "flux-token")

    config = load_config()
    assert config.openai_api_key == ""


def test_load_config_requires_openai_when_provider_openai(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("MAILPILOT_AI_PROVIDER", "openai")
    monkeypatch.setenv("FLUX_API_URL", "https://api.example.test")
    monkeypatch.setenv("FLUX_SERVICE_TOKEN", "flux-token")

    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        load_config()
