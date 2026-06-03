from __future__ import annotations

import json
import logging
import random
import time
from dataclasses import dataclass
from typing import Any, Literal, Protocol, cast

from openai import OpenAI

from .config import (
    get_ai_max_body_chars,
    get_ai_max_snippet_chars,
    get_ai_max_subject_chars,
    get_archive_security_noise,
    get_classification_delay_ms,
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


class OpenAIClassifier:
    """
    OpenAI-backed classifier implementing the Strategy pattern.
    """

    def __init__(self, client: OpenAI | None = None) -> None:
        """
        Optionally accept a preconfigured OpenAI client (useful for testing).
        """
        self._model = get_openai_model_name()
        self._min_delay_seconds = max(0, get_classification_delay_ms()) / 1000.0
        self._max_retries = max(0, get_openai_max_retries())
        self._retry_base_seconds = max(0, get_openai_retry_base_ms()) / 1000.0
        self._max_subject_chars = max(0, get_ai_max_subject_chars())
        self._max_snippet_chars = max(0, get_ai_max_snippet_chars())
        self._max_body_chars = max(0, get_ai_max_body_chars())
        self._next_request_not_before = 0.0
        if client is not None:
            self._client = client
        else:
            config = load_config()
            self._client = OpenAI(api_key=config.openai_api_key, max_retries=0)

    def _sleep_before_request(self) -> None:
        if self._min_delay_seconds <= 0:
            return
        now = time.monotonic()
        if self._next_request_not_before > now:
            time.sleep(self._next_request_not_before - now)
        self._next_request_not_before = time.monotonic() + self._min_delay_seconds

    def _request_text(self, user_input: str) -> str:
        attempt = 0
        while True:
            self._sleep_before_request()
            try:
                # Branch for test/dummy clients that expose the legacy .responses surface.
                if hasattr(self._client, "responses"):
                    response = self._client.responses.create(
                        model=self._model,
                        instructions=SYSTEM_PROMPT.strip(),
                        input=user_input,
                    )
                    # OpenAI response stubs use a wide output union; runtime shape is fixed for this call.
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

                retry_after = _retry_after_seconds(exc)
                backoff_seconds = (
                    retry_after
                    if retry_after is not None
                    else self._retry_base_seconds * (2**attempt)
                )
                jitter_seconds = backoff_seconds * 0.15 * random.random()
                sleep_for = max(self._min_delay_seconds, backoff_seconds + jitter_seconds)
                logger.warning(
                    "OpenAI rate limited; retrying in %.2fs (attempt %s/%s)",
                    sleep_for,
                    attempt + 1,
                    self._max_retries,
                )
                time.sleep(sleep_for)
                attempt += 1

    def classify(
        self,
        subject: str | None,
        sender: str | None,
        body: str | None,
        snippet: str | None,
    ) -> ClassifiedEmail:
        content: dict[str, str] = {}
        subject_text = _trim_field(subject, self._max_subject_chars)
        if subject_text is not None:
            content["subject"] = subject_text

        sender_text = (sender or "").strip()
        if sender_text:
            content["sender"] = sender_text

        snippet_text = _trim_field(snippet, self._max_snippet_chars)
        if snippet_text is not None:
            content["snippet"] = snippet_text

        body_text = _trim_field(body, self._max_body_chars)
        if body_text is not None:
            content["body"] = body_text

        user_input = (
            "Classify the following email into one category.\n\n"
            + json.dumps(content, ensure_ascii=False, indent=2)
        )

        text = self._request_text(user_input)

        try:
            payload = json.loads(text)
            raw_category = payload.get("category")
            noise = payload.get("noise", False)
            noise_type = payload.get("noise_type") or ""
            confidence = payload.get("confidence")
            reason = payload.get("reason") or payload.get("rationale")
        except Exception as exc:
            logger.error(
                "Failed to parse OpenAI classifier response: %s (response_length=%d)",
                exc,
                len(text or ""),
            )
            raise ClassificationError("Failed to parse classifier response") from exc

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
            confidence=confidence,
            rationale=reason,
            noise=noise,
            noise_type=noise_type if noise else None,
            reason=reason,
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
