from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Literal, Protocol, cast

from openai import OpenAI

from .config import get_archive_security_noise, get_openai_model_name, load_config


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
        if client is not None:
            self._client = client
        else:
            config = load_config()
            self._client = OpenAI(api_key=config.openai_api_key)

    def classify(
        self,
        subject: str | None,
        sender: str | None,
        body: str | None,
        snippet: str | None,
    ) -> ClassifiedEmail:
        content = {
            "subject": subject or "",
            "sender": sender or "",
            "body": (body or "")[:8000],
            "snippet": snippet or "",
        }

        user_input = (
            "Classify the following email into one category.\n\n"
            + json.dumps(content, ensure_ascii=False, indent=2)
        )

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
                text = resp.output[0].content[0].text
            else:
                chat = self._client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT.strip()},
                        {"role": "user", "content": user_input},
                    ],
                    temperature=0,
                )
                text = chat.choices[0].message.content or ""
        except Exception as exc:  # network or API error
            logger.error("OpenAI classification failed: %s", exc)
            raise ClassificationError("OpenAI classification failed") from exc

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
