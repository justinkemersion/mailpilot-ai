from __future__ import annotations

import json
import logging
import random
import re
import time
from dataclasses import dataclass
from typing import Any, Literal, Protocol, cast

import requests
from openai import OpenAI

from .config import (
    get_ai_max_body_chars,
    get_ai_max_snippet_chars,
    get_ai_max_subject_chars,
    get_ai_provider,
    get_archive_security_noise,
    get_classification_delay_ms,
    get_cloudflare_api_token,
    get_cloudflare_model_name,
    get_cloudflare_run_url,
    get_openai_api_key,
    get_openai_max_retries,
    get_openai_model_name,
    get_openai_retry_base_ms,
    load_config,
)


logger = logging.getLogger(__name__)

Category = Literal[
    "important",
    "work",
    "receipts",
    "newsletters",
    "promotions",
    "personal",
    "spam",
]

VALID_CATEGORIES = (
    "important",
    "work",
    "receipts",
    "newsletters",
    "promotions",
    "personal",
    "spam",
)
VALID_NOISE_TYPES = (
    "promotion",
    "newsletter",
    "security",
    "receipt",
    "product",
    "social",
    "automated",
    "digest",
    "notification",
    "unknown",
)

CLASSIFICATION_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "category": {"type": "string"},
        "noise": {"type": "boolean"},
        "noise_type": {"type": "string"},
        "confidence": {"type": "number"},
        "reason": {"type": "string"},
    },
    "required": ["category", "noise", "confidence", "reason"],
}


@dataclass
class ClassifiedEmail:
    category: Category
    confidence: float | None = None
    rationale: str | None = None
    noise: bool = False
    noise_type: str | None = None
    reason: str | None = None


class Classifier(Protocol):
    def classify(
        self,
        subject: str | None,
        sender: str | None,
        body: str | None,
        snippet: str | None,
    ) -> ClassifiedEmail: ...


class ClassificationError(Exception):
    """
    Raised when the classifier cannot safely determine a category
    (e.g. API timeout, malformed response).
    """


def _is_rate_limit_error(exc: Exception) -> bool:
    status_code = getattr(exc, "status_code", None)
    if status_code == 429:
        return True
    return exc.__class__.__name__ == "RateLimitError"


def _retry_after_seconds(exc: Exception) -> float | None:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if not headers:
        return None
    raw = headers.get("retry-after") or headers.get("Retry-After")
    if raw in (None, ""):
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _trim_field(value: str | None, limit: int) -> str | None:
    if limit <= 0:
        return None
    trimmed = (value or "")[:limit].strip()
    return trimmed or None


def _build_email_content(
    subject: str | None,
    sender: str | None,
    body: str | None,
    snippet: str | None,
    *,
    max_subject_chars: int,
    max_snippet_chars: int,
    max_body_chars: int,
) -> dict[str, str]:
    content: dict[str, str] = {}
    subject_text = _trim_field(subject, max_subject_chars)
    if subject_text is not None:
        content["subject"] = subject_text

    sender_text = (sender or "").strip()
    if sender_text:
        content["sender"] = sender_text

    snippet_text = _trim_field(snippet, max_snippet_chars)
    if snippet_text is not None:
        content["snippet"] = snippet_text

    body_text = _trim_field(body, max_body_chars)
    if body_text is not None:
        content["body"] = body_text

    return content


def _build_user_input(content: dict[str, str]) -> str:
    return (
        "Classify the following email into one category.\n\n"
        + json.dumps(content, ensure_ascii=False, indent=2)
    )


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)


def _parse_json_payload(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        raise ValueError(f"expected JSON object or string, got {type(raw).__name__}")

    text = raw.strip()
    fence = _JSON_FENCE_RE.search(text)
    if fence:
        text = fence.group(1).strip()

    payload = json.loads(text)
    if not isinstance(payload, dict):
        raise ValueError("classifier JSON must be an object")
    return payload


def _payload_to_classified_email(payload: dict[str, Any]) -> ClassifiedEmail:
    raw_category = payload.get("category")
    noise = bool(payload.get("noise", False))
    noise_type = payload.get("noise_type") or ""
    confidence = payload.get("confidence")
    reason = payload.get("reason") or payload.get("rationale")

    category: Category
    if noise:
        noise_type = (noise_type or "unknown").strip().lower()
        if noise_type not in VALID_NOISE_TYPES:
            noise_type = "unknown"
        category = _noise_type_to_category(
            noise_type, archive_security_noise=get_archive_security_noise()
        )
    else:
        raw_cat = raw_category if isinstance(raw_category, str) else None
        if not raw_cat or raw_cat not in VALID_CATEGORIES:
            logger.warning(
                "Model returned unknown category %s for non-noise; defaulting to important",
                raw_category,
            )
            category = "important"
        else:
            category = cast(Category, raw_cat)

    return ClassifiedEmail(
        category=category,
        confidence=confidence if isinstance(confidence, (int, float)) else None,
        rationale=reason if isinstance(reason, str) else None,
        noise=noise,
        noise_type=noise_type if noise else None,
        reason=reason if isinstance(reason, str) else None,
    )


def _parse_classification_response(raw: Any, *, provider_label: str) -> ClassifiedEmail:
    try:
        payload = _parse_json_payload(raw)
        return _payload_to_classified_email(payload)
    except Exception as exc:
        raw_len = len(raw) if isinstance(raw, str) else 0
        logger.error(
            "Failed to parse %s classifier response: %s (response_length=%d)",
            provider_label,
            exc,
            raw_len,
        )
        raise ClassificationError("Failed to parse classifier response") from exc


SYSTEM_PROMPT = """
You are an email classification assistant used in a Gmail processing pipeline.

Your primary goal is to identify and label "noise" emails — messages that do not require human attention and contribute to inbox clutter.

Noise includes:
- Promotions and marketing emails
- Newsletters
- Automated notifications
- System alerts
- Social media notifications
- Product update emails
- Account activity alerts
- Receipts and transactional confirmations
- Digest emails
- Event invitations from platforms
- Cold outreach

Non-noise includes:
- Personal emails
- Direct communication from a real person
- Work communication
- Emails requiring action or reply
- Time-sensitive alerts

You must output a JSON object with the following fields:
{
  "category": "<one_of: important|work|receipts|newsletters|promotions|personal|spam>",
  "noise": true or false,
  "noise_type": "<see list below or empty if noise is false>",
  "confidence": <number between 0 and 1>,
  "reason": "<short one-sentence explanation>"
}

Rules:
1. If the email is automated or bulk-sent, classify it as noise.
2. If the sender is a system (Google, GitHub, LinkedIn, Amazon, etc), it is usually noise unless the message clearly requires action.
3. Marketing and newsletters are always noise.
4. Only mark as important (noise=false, category=important) when the message requires user action, is time-sensitive, or is direct human communication. The word "Important" in the subject line or the sender being a bank/company does NOT by itself make the email important; automated notices, statements, and tips are still noise.
5. Security: routine security messages are noise with noise_type "security" (e.g. "2FA backup codes generated", "You allowed X app", "2-Step Verification turned on", security tips, routine account activity). Only treat as non-noise important when truly critical (e.g. new sign-in from unknown device, password change, suspicious activity, possible compromise).
6. Receipts, statements, and transactional confirmations are noise labeled "receipt".
7. Promotions are labeled "promotion", newsletters "newsletter", product notifications "product", social "social".
8. If unsure, set noise=true with lower confidence.

Noise types (use exactly one when noise is true): promotion, newsletter, security, receipt, product, social, automated, digest, notification, unknown.

Return ONLY the JSON object, no other text.
"""


class _RetryThrottleMixin:
    def __init__(self) -> None:
        self._min_delay_seconds = max(0, get_classification_delay_ms()) / 1000.0
        self._max_retries = max(0, get_openai_max_retries())
        self._retry_base_seconds = max(0, get_openai_retry_base_ms()) / 1000.0
        self._max_subject_chars = max(0, get_ai_max_subject_chars())
        self._max_snippet_chars = max(0, get_ai_max_snippet_chars())
        self._max_body_chars = max(0, get_ai_max_body_chars())
        self._next_request_not_before = 0.0

    def _sleep_before_request(self) -> None:
        if self._min_delay_seconds <= 0:
            return
        now = time.monotonic()
        if self._next_request_not_before > now:
            time.sleep(self._next_request_not_before - now)
        self._next_request_not_before = time.monotonic() + self._min_delay_seconds

    def _build_request_input(
        self,
        subject: str | None,
        sender: str | None,
        body: str | None,
        snippet: str | None,
    ) -> str:
        content = _build_email_content(
            subject,
            sender,
            body,
            snippet,
            max_subject_chars=self._max_subject_chars,
            max_snippet_chars=self._max_snippet_chars,
            max_body_chars=self._max_body_chars,
        )
        return _build_user_input(content)

    def _sleep_for_rate_limit(self, exc: Exception, attempt: int) -> None:
        retry_after = _retry_after_seconds(exc)
        backoff_seconds = (
            retry_after
            if retry_after is not None
            else self._retry_base_seconds * (2**attempt)
        )
        jitter_seconds = backoff_seconds * 0.15 * random.random()
        sleep_for = max(self._min_delay_seconds, backoff_seconds + jitter_seconds)
        logger.warning(
            "Rate limited; retrying in %.2fs (attempt %s/%s)",
            sleep_for,
            attempt + 1,
            self._max_retries,
        )
        time.sleep(sleep_for)


class OpenAIClassifier(_RetryThrottleMixin):
    """
    OpenAI-backed classifier implementing the Strategy pattern.
    """

    def __init__(self, client: OpenAI | None = None) -> None:
        """
        Optionally accept a preconfigured OpenAI client (useful for testing).
        """
        super().__init__()
        self._model = get_openai_model_name()
        if client is not None:
            self._client = client
        else:
            self._client = OpenAI(api_key=get_openai_api_key(), max_retries=0)

    def _request_text(self, user_input: str) -> str:
        attempt = 0
        while True:
            self._sleep_before_request()
            try:
                if hasattr(self._client, "responses"):
                    response = self._client.responses.create(
                        model=self._model,
                        instructions=SYSTEM_PROMPT.strip(),
                        input=user_input,
                    )
                    resp: Any = response
                    return resp.output[0].content[0].text

                chat = self._client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT.strip()},
                        {"role": "user", "content": user_input},
                    ],
                    temperature=0,
                )
                return chat.choices[0].message.content or ""
            except Exception as exc:  # network or API error
                if not _is_rate_limit_error(exc) or attempt >= self._max_retries:
                    logger.error("OpenAI classification failed: %s", exc)
                    raise ClassificationError("OpenAI classification failed") from exc

                self._sleep_for_rate_limit(exc, attempt)
                attempt += 1

    def classify(
        self,
        subject: str | None,
        sender: str | None,
        body: str | None,
        snippet: str | None,
    ) -> ClassifiedEmail:
        user_input = self._build_request_input(subject, sender, body, snippet)
        text = self._request_text(user_input)
        return _parse_classification_response(text, provider_label="OpenAI")


class CloudflareClassifier(_RetryThrottleMixin):
    """
    Cloudflare Workers AI classifier (default: Llama 3.1 8B instruct fast).
    """

    def __init__(
        self,
        *,
        run_url: str | None = None,
        api_token: str | None = None,
        model: str | None = None,
        session: requests.Session | None = None,
    ) -> None:
        super().__init__()
        self._run_url = run_url or get_cloudflare_run_url()
        self._api_token = api_token or get_cloudflare_api_token()
        self._model = model or get_cloudflare_model_name()
        self._session = session or requests.Session()
        self.last_request_json: dict[str, Any] | None = None

    def _request_payload(self, user_input: str, *, use_json_mode: bool) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT.strip()},
                {"role": "user", "content": user_input},
            ],
        }
        if use_json_mode:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": CLASSIFICATION_JSON_SCHEMA,
            }
        return payload

    def _extract_response_body(self, data: dict[str, Any]) -> Any:
        if not data.get("success", True):
            errors = data.get("errors") or []
            message = "; ".join(
                str(err.get("message", err)) for err in errors if err is not None
            )
            raise ClassificationError(
                message or "Cloudflare Workers AI request failed"
            )

        result = data.get("result")
        if isinstance(result, dict) and "response" in result:
            return result["response"]
        if isinstance(result, str):
            return result
        if "response" in data:
            return data["response"]
        raise ClassificationError("Cloudflare Workers AI returned an unexpected payload")

    def _post(self, payload: dict[str, Any]) -> Any:
        self.last_request_json = payload
        response = self._session.post(
            self._run_url,
            headers={
                "Authorization": f"Bearer {self._api_token}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )
        if response.status_code == 429:
            exc = requests.HTTPError("429 Too Many Requests", response=response)
            exc.status_code = 429  # type: ignore[attr-defined]
            raise exc
        response.raise_for_status()
        return self._extract_response_body(response.json())

    def _request_response(self, user_input: str) -> Any:
        attempt = 0
        use_json_mode = True
        while True:
            self._sleep_before_request()
            try:
                return self._post(self._request_payload(user_input, use_json_mode=use_json_mode))
            except ClassificationError as exc:
                if use_json_mode and "JSON Mode couldn't be met" in str(exc):
                    logger.warning(
                        "Cloudflare JSON mode failed for %s; retrying without schema",
                        self._model,
                    )
                    use_json_mode = False
                    continue
                logger.error("Cloudflare classification failed: %s", exc)
                raise
            except requests.HTTPError as exc:
                status_code = getattr(exc.response, "status_code", None)
                if status_code == 429 and attempt < self._max_retries:
                    exc.status_code = 429  # type: ignore[attr-defined]
                    self._sleep_for_rate_limit(exc, attempt)
                    attempt += 1
                    continue
                logger.error("Cloudflare classification failed: %s", exc)
                raise ClassificationError("Cloudflare classification failed") from exc
            except Exception as exc:
                logger.error("Cloudflare classification failed: %s", exc)
                raise ClassificationError("Cloudflare classification failed") from exc

    def classify(
        self,
        subject: str | None,
        sender: str | None,
        body: str | None,
        snippet: str | None,
    ) -> ClassifiedEmail:
        user_input = self._build_request_input(subject, sender, body, snippet)
        raw = self._request_response(user_input)
        return _parse_classification_response(raw, provider_label="Cloudflare")


def create_classifier() -> Classifier:
    """Return the configured email classifier implementation."""
    provider = get_ai_provider()
    if provider == "cloudflare":
        logger.info(
            "Using Cloudflare Workers AI classifier (model=%s)",
            get_cloudflare_model_name(),
        )
        return CloudflareClassifier()
    if provider == "openai":
        return OpenAIClassifier()
    raise RuntimeError(
        f"Unknown MAILPILOT_AI_PROVIDER={provider!r}; use 'openai' or 'cloudflare'"
    )


def _noise_type_to_category(
    noise_type: str, *, archive_security_noise: bool = False
) -> Category:
    """Map classifier noise_type to internal Category for labels/archive actions."""
    if noise_type == "promotion":
        return "promotions"
    if noise_type == "newsletter":
        return "newsletters"
    if noise_type == "receipt":
        return "receipts"
    if noise_type == "security":
        return "newsletters" if archive_security_noise else "important"
    return "newsletters"
