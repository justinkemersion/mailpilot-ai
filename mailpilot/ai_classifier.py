from __future__ import annotations

import json
import os
import logging
from dataclasses import dataclass
from typing import Literal, Protocol

from openai import OpenAI

from .config import get_openai_model_name, load_config


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


class Classifier(Protocol):
    def classify(
        self,
        subject: str | None,
        sender: str | None,
        body: str | None,
        snippet: str | None,
    ) -> ClassifiedEmail: ...


SYSTEM_PROMPT = """
You are an AI email triage assistant for a power user.

You MUST classify each email into exactly one of the following categories:
- important: time-sensitive, high-value, or requires action from the user (e.g., manager, key customer, legal/financial deadlines, account security alerts).
- work: general work-related but not mission-critical or time-sensitive.
- receipts: receipts, invoices, payment confirmations, subscription renewals, order confirmations, billing statements.
- newsletters: recurring content like newsletters, blog digests, marketing content the user opted into.
- promotions: sales, limited-time offers, discounts, ads, marketing blasts.
- personal: friends, family, non-work social communication.
- spam: obvious spam, phishing, scams, or unwanted automated junk.

Return ONLY a compact JSON object with this exact schema:
{
  "category": "<one_of: important|work|receipts|newsletters|promotions|personal|spam>",
  "confidence": <number between 0 and 1>,
  "rationale": "<short one-sentence explanation>"
}
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
            response = self._client.responses.create(
                model=self._model,
                instructions=SYSTEM_PROMPT.strip(),
                input=user_input,
                response_format={"type": "json_object"},
            )
        except Exception as exc:  # network or API error
            logger.error("OpenAI classification failed: %s", exc)
            return ClassifiedEmail(category="important", confidence=None, rationale=None)

        text = response.output[0].content[0].text
        try:
            payload = json.loads(text)
            category = payload.get("category", "important")
            confidence = payload.get("confidence")
            rationale = payload.get("rationale")
        except Exception as exc:
            logger.error("Failed to parse OpenAI classifier response: %s; raw=%s", exc, text)
            category = "important"
            confidence = None
            rationale = None

        if category not in [
            "important",
            "work",
            "receipts",
            "newsletters",
            "promotions",
            "personal",
            "spam",
        ]:
            logger.warning("Model returned unknown category %s; defaulting to important", category)
            category = "important"

        return ClassifiedEmail(category=category, confidence=confidence, rationale=rationale)
