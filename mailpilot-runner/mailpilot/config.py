import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


_ROOT_DIR = Path(__file__).resolve().parent.parent

_dotenv_loaded = False


def _load_dotenv() -> None:
    """
    Load environment variables from a .env file if present (once per process).

    This is safe in production because real env vars take precedence.
    """
    global _dotenv_loaded
    if _dotenv_loaded:
        return
    # During pytest runs, avoid loading .env so tests can control
    # configuration purely via environment variables.
    if os.getenv("PYTEST_CURRENT_TEST"):
        _dotenv_loaded = True
        return
    env_path = _ROOT_DIR / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    _dotenv_loaded = True


@dataclass(frozen=True)
class MailPilotConfig:
    openai_api_key: str
    supabase_url: str
    supabase_service_role_key: str
    poll_interval_seconds: int
    log_level: str


def get_openai_model_name() -> str:
    """
    Return the OpenAI model name to use for classification.

    This is intentionally independent from the main MailPilotConfig so that
    tests can configure a classifier with a dummy OpenAI client without
    requiring OPENAI_API_KEY to be set.
    """
    _load_dotenv()
    return os.getenv("MAILPILOT_OPENAI_MODEL", "gpt-4.1-mini")


def get_safe_sender_domains() -> list[str]:
    """
    Return the configured safe sender domains as a lowercased list.

    Read from MAILPILOT_SAFE_SENDER_DOMAINS (comma-separated), e.g.:
    MAILPILOT_SAFE_SENDER_DOMAINS=mycompany.com,bank.com
    """
    _load_dotenv()
    raw = os.getenv("MAILPILOT_SAFE_SENDER_DOMAINS", "")
    return [d.strip().lower() for d in raw.split(",") if d.strip()]


def get_safe_senders() -> list[str]:
    """
    Return the configured exact safe sender email addresses as a lowercased list.

    Read from MAILPILOT_SAFE_SENDERS (comma-separated), e.g.:
    MAILPILOT_SAFE_SENDERS=boss@example.com,billing@bank.com
    """
    _load_dotenv()
    raw = os.getenv("MAILPILOT_SAFE_SENDERS", "")
    return [s.strip().lower() for s in raw.split(",") if s.strip()]


def get_max_archives_per_run() -> int:
    """
    Return the maximum number of archive actions allowed per run.

    Controlled by MAILPILOT_MAX_ARCHIVES_PER_RUN (default: 30).
    """
    _load_dotenv()
    raw = os.getenv("MAILPILOT_MAX_ARCHIVES_PER_RUN", "30")
    try:
        return int(raw)
    except ValueError:
        return 30


def get_max_spam_marks_per_run() -> int:
    """
    Return the maximum number of spam mark actions allowed per run.

    Controlled by MAILPILOT_MAX_SPAM_MARKS_PER_RUN (default: 10).
    """
    _load_dotenv()
    raw = os.getenv("MAILPILOT_MAX_SPAM_MARKS_PER_RUN", "10")
    try:
        return int(raw)
    except ValueError:
        return 10


def get_max_label_actions_per_run() -> int:
    """
    Return the maximum number of label modifications allowed per run.

    Controlled by MAILPILOT_MAX_LABEL_ACTIONS_PER_RUN (default: 200).
    """
    _load_dotenv()
    raw = os.getenv("MAILPILOT_MAX_LABEL_ACTIONS_PER_RUN", "200")
    try:
        return int(raw)
    except ValueError:
        return 200


def get_archive_security_noise() -> bool:
    """
    When True, routine security noise (e.g. 2FA backup codes, app access confirmations)
    is archived like newsletters instead of being marked important. Default: False.
    Set MAILPILOT_ARCHIVE_SECURITY_NOISE=1 to enable.
    """
    _load_dotenv()
    raw = os.getenv("MAILPILOT_ARCHIVE_SECURITY_NOISE", "0").lower()
    return raw in ("1", "true", "yes")


def get_archive_receipts() -> bool:
    """
    When True, receipts and transactional confirmations are archived (with the same
    per-run limits as newsletters). Default: False. Set MAILPILOT_ARCHIVE_RECEIPTS=1 to enable.
    """
    _load_dotenv()
    raw = os.getenv("MAILPILOT_ARCHIVE_RECEIPTS", "0").lower()
    return raw in ("1", "true", "yes")


def load_supabase_credentials() -> tuple[str, str]:
    """
    Return (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) for health checks that
    must not require OPENAI_API_KEY.
    """
    _load_dotenv()
    url = (os.getenv("SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required but not set"
        )
    return url, key


def load_config() -> MailPilotConfig:
    """
    Build a MailPilotConfig from environment variables.

    Raises:
        RuntimeError: if required configuration is missing.
    """
    _load_dotenv()

    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required but not set")

    supabase_url, supabase_service_role_key = load_supabase_credentials()

    poll_interval_seconds_raw = os.getenv("MAILPILOT_POLL_INTERVAL_SECONDS", "300")
    try:
        poll_interval_seconds = int(poll_interval_seconds_raw)
    except ValueError as exc:
        raise RuntimeError(
            "MAILPILOT_POLL_INTERVAL_SECONDS must be an integer"
        ) from exc

    log_level = os.getenv("MAILPILOT_LOG_LEVEL", "INFO").upper()

    return MailPilotConfig(
        openai_api_key=openai_api_key,
        supabase_url=supabase_url,
        supabase_service_role_key=supabase_service_role_key,
        poll_interval_seconds=poll_interval_seconds,
        log_level=log_level,
    )
