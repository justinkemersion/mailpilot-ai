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


def _get_int_env(name: str, default: int) -> int:
    _load_dotenv()
    raw = os.getenv(name, str(default))
    try:
        return int(raw)
    except ValueError:
        return default


def get_openai_model_name() -> str:
    """
    Return the OpenAI model name to use for classification.

    This is intentionally independent from the main MailPilotConfig so that
    tests can configure a classifier with a dummy OpenAI client without
    requiring an OpenAI API key to be set.
    """
    _load_dotenv()
    return os.getenv("MAILPILOT_OPENAI_MODEL", "gpt-4.1-mini")


def get_ai_provider() -> str:
    """
    Return the configured AI provider.

    Controlled by MAILPILOT_AI_PROVIDER (default: openai).
    Supported values: ``openai``, ``cloudflare``.
    """
    _load_dotenv()
    return (os.getenv("MAILPILOT_AI_PROVIDER") or "openai").strip().lower()


def cloudflare_configured() -> bool:
    """True when Cloudflare Workers AI credentials are present."""
    _load_dotenv()
    token = (
        os.getenv("MAILPILOT_CLOUDFLARE_API_TOKEN")
        or os.getenv("CLOUDFLARE_API_TOKEN")
        or ""
    ).strip()
    if not token:
        return False
    if (os.getenv("MAILPILOT_CLOUDFLARE_BASE_URL") or "").strip():
        return True
    account_id = (
        os.getenv("MAILPILOT_CLOUDFLARE_ACCOUNT_ID")
        or os.getenv("CLOUDFLARE_ACCOUNT_ID")
        or ""
    ).strip()
    return bool(account_id)


def get_openai_api_key() -> str:
    """
    Return the OpenAI API key used for classification.

    Controlled by OPENAI_API_KEY.
    """
    _load_dotenv()
    value = (os.getenv("OPENAI_API_KEY") or "").strip()
    if value:
        return value
    raise RuntimeError("OPENAI_API_KEY is required but not set")


def get_cloudflare_base_url() -> str:
    """
    Optional override for the full Workers AI run URL (custom Worker proxy).

    When unset, the runner calls the Cloudflare REST API using account id + model.
    Controlled by MAILPILOT_CLOUDFLARE_BASE_URL.
    """
    _load_dotenv()
    return (os.getenv("MAILPILOT_CLOUDFLARE_BASE_URL") or "").strip()


def get_cloudflare_account_id() -> str:
    """
    Cloudflare account id for Workers AI REST calls.

    Controlled by MAILPILOT_CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_ID.
    Not required when MAILPILOT_CLOUDFLARE_BASE_URL is set.
    """
    _load_dotenv()
    value = (
        os.getenv("MAILPILOT_CLOUDFLARE_ACCOUNT_ID")
        or os.getenv("CLOUDFLARE_ACCOUNT_ID")
        or ""
    ).strip()
    if value:
        return value
    raise RuntimeError(
        "MAILPILOT_CLOUDFLARE_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID) is required "
        "when MAILPILOT_AI_PROVIDER=cloudflare and MAILPILOT_CLOUDFLARE_BASE_URL is not set"
    )


def get_cloudflare_api_token() -> str:
    """
    Return the Cloudflare API token (Workers AI read permission).

    Controlled by MAILPILOT_CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_TOKEN.
    """
    _load_dotenv()
    value = (
        os.getenv("MAILPILOT_CLOUDFLARE_API_TOKEN")
        or os.getenv("CLOUDFLARE_API_TOKEN")
        or ""
    ).strip()
    if value:
        return value
    raise RuntimeError(
        "MAILPILOT_CLOUDFLARE_API_TOKEN (or CLOUDFLARE_API_TOKEN) is required "
        "when MAILPILOT_AI_PROVIDER=cloudflare"
    )


def get_cloudflare_model_name() -> str:
    """
    Return the Cloudflare Workers AI model id.

    Controlled by MAILPILOT_CLOUDFLARE_MODEL
    (default: @cf/meta/llama-3.1-8b-instruct-fast).
    """
    _load_dotenv()
    return os.getenv(
        "MAILPILOT_CLOUDFLARE_MODEL",
        "@cf/meta/llama-3.1-8b-instruct-fast",
    )


def get_cloudflare_run_url() -> str:
    """
    Return the URL used for a single Workers AI classification request.
    """
    base = get_cloudflare_base_url()
    if base:
        return base.rstrip("/")
    account_id = get_cloudflare_account_id()
    model = get_cloudflare_model_name()
    return (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"
    )


def validate_classifier_config() -> None:
    """Ensure env vars for the configured AI provider are present."""
    provider = get_ai_provider()
    if provider == "openai":
        get_openai_api_key()
        return
    if provider == "cloudflare":
        get_cloudflare_api_token()
        get_cloudflare_run_url()
        return
    raise RuntimeError(
        f"Unknown MAILPILOT_AI_PROVIDER={provider!r}; use 'openai' or 'cloudflare'"
    )


def get_classifier_info() -> dict[str, str]:
    """
    Return provider, model id, and a human-readable label for UI/CLI output.

    Keys: ai_provider, ai_model, ai_label.
    """
    provider = get_ai_provider()
    if provider == "cloudflare":
        model = get_cloudflare_model_name()
        short = model.removeprefix("@cf/meta/").replace("-", " ")
        return {
            "ai_provider": "cloudflare",
            "ai_model": model,
            "ai_label": f"Cloudflare Workers AI · {short}",
        }
    model = get_openai_model_name()
    return {
        "ai_provider": "openai",
        "ai_model": model,
        "ai_label": f"OpenAI · {model}",
    }


def get_ai_max_subject_chars() -> int:
    """
    Return the maximum subject characters included in an LLM request.

    Controlled by MAILPILOT_AI_MAX_SUBJECT_CHARS (default: 200).
    Set to 0 to omit subjects entirely (usually not recommended).
    """
    return _get_int_env("MAILPILOT_AI_MAX_SUBJECT_CHARS", 200)


def get_ai_max_snippet_chars() -> int:
    """
    Return the maximum snippet characters included in an LLM request.

    Controlled by MAILPILOT_AI_MAX_SNIPPET_CHARS (default: 600).
    Set to 0 to omit snippets entirely.
    """
    return _get_int_env("MAILPILOT_AI_MAX_SNIPPET_CHARS", 600)


def get_ai_max_body_chars() -> int:
    """
    Return the maximum body characters included in an LLM request.

    Controlled by MAILPILOT_AI_MAX_BODY_CHARS (default: 2000).
    Set to 0 to omit bodies entirely for the cheapest classification path.
    """
    return _get_int_env("MAILPILOT_AI_MAX_BODY_CHARS", 2000)


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
    return _get_int_env("MAILPILOT_MAX_ARCHIVES_PER_RUN", 30)


def get_max_spam_marks_per_run() -> int:
    """
    Return the maximum number of spam mark actions allowed per run.

    Controlled by MAILPILOT_MAX_SPAM_MARKS_PER_RUN (default: 10).
    """
    return _get_int_env("MAILPILOT_MAX_SPAM_MARKS_PER_RUN", 10)


def get_max_label_actions_per_run() -> int:
    """
    Return the maximum number of label modifications allowed per run.

    Controlled by MAILPILOT_MAX_LABEL_ACTIONS_PER_RUN (default: 200).
    """
    return _get_int_env("MAILPILOT_MAX_LABEL_ACTIONS_PER_RUN", 200)


def get_max_classifications_per_run() -> int:
    """
    Return the maximum number of LLM classifications allowed per run.

    Controlled by MAILPILOT_MAX_CLASSIFICATIONS_PER_RUN (default: 50).
    """
    return _get_int_env("MAILPILOT_MAX_CLASSIFICATIONS_PER_RUN", 50)


def get_max_classifications_per_account() -> int:
    """
    Return the maximum number of LLM classifications allowed per account in a run.

    Controlled by MAILPILOT_MAX_CLASSIFICATIONS_PER_ACCOUNT (default: 25).
    """
    return _get_int_env("MAILPILOT_MAX_CLASSIFICATIONS_PER_ACCOUNT", 25)


def get_max_dry_run_classifications() -> int:
    """
    Return the maximum number of LLM classifications allowed during dry runs.

    Controlled by MAILPILOT_DRY_RUN_MAX_CLASSIFICATIONS (default: 10).
    """
    return _get_int_env("MAILPILOT_DRY_RUN_MAX_CLASSIFICATIONS", 10)


def get_gmail_max_messages_per_account() -> int:
    """
    Return the maximum number of Gmail message ids fetched per account.

    Controlled by MAILPILOT_GMAIL_MAX_MESSAGES_PER_ACCOUNT (default: 100).
    """
    return _get_int_env("MAILPILOT_GMAIL_MAX_MESSAGES_PER_ACCOUNT", 100)


def get_classification_delay_ms() -> int:
    """
    Return the minimum spacing between OpenAI classification requests.

    Controlled by MAILPILOT_CLASSIFICATION_DELAY_MS (default: 250).
    """
    return _get_int_env("MAILPILOT_CLASSIFICATION_DELAY_MS", 250)


def get_openai_max_retries() -> int:
    """
    Return how many MailPilot-owned retries to allow for OpenAI 429s.

    Controlled by MAILPILOT_OPENAI_MAX_RETRIES (default: 4).
    """
    return _get_int_env("MAILPILOT_OPENAI_MAX_RETRIES", 4)


def get_openai_retry_base_ms() -> int:
    """
    Return the base exponential backoff for OpenAI 429 retries.

    Controlled by MAILPILOT_OPENAI_RETRY_BASE_MS (default: 750).
    """
    return _get_int_env("MAILPILOT_OPENAI_RETRY_BASE_MS", 750)


def get_processing_claim_ttl_seconds() -> int:
    """
    Return how long an in-flight processing claim can live before being treated as stale.

    Controlled by MAILPILOT_PROCESSING_CLAIM_TTL_SECONDS (default: 1800).
    """
    return _get_int_env("MAILPILOT_PROCESSING_CLAIM_TTL_SECONDS", 1800)


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


def load_flux_credentials() -> tuple[str, str, str]:
    """
    Return (FLUX_API_URL, FLUX_SERVICE_TOKEN, FLUX_POSTGREST_SCHEMA).

    FLUX_API_URL may be set explicitly or via NEXT_PUBLIC_FLUX_URL (same value as the web app).
    """
    _load_dotenv()
    url = (
        os.getenv("FLUX_API_URL")
        or os.getenv("NEXT_PUBLIC_FLUX_URL")
        or ""
    ).strip()
    token = (os.getenv("FLUX_SERVICE_TOKEN") or "").strip()
    schema = (os.getenv("FLUX_POSTGREST_SCHEMA") or "api").strip() or "api"
    if not url or not token:
        raise RuntimeError(
            "FLUX_API_URL (or NEXT_PUBLIC_FLUX_URL) and FLUX_SERVICE_TOKEN are required but not set"
        )
    return url, token, schema


def flux_configured() -> bool:
    """True when Flux PostgREST credentials are present in the environment."""
    _load_dotenv()
    url = (
        os.getenv("FLUX_API_URL")
        or os.getenv("NEXT_PUBLIC_FLUX_URL")
        or ""
    ).strip()
    token = (os.getenv("FLUX_SERVICE_TOKEN") or "").strip()
    return bool(url and token)


def load_supabase_credentials() -> tuple[str, str]:
    """
    Return (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) for health checks that
    must not require an OpenAI API key.
    """
    _load_dotenv()
    url = (os.getenv("SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required but not set"
        )
    return url, key


def create_db_client():
    """
    Return a database client for repositories (Flux PostgREST or Supabase).

    Prefers Flux when FLUX_API_URL/NEXT_PUBLIC_FLUX_URL and FLUX_SERVICE_TOKEN are set.
    """
    if flux_configured():
        from .flux_postgrest import FluxPostgrestClient

        url, token, schema = load_flux_credentials()
        return FluxPostgrestClient(url, token, schema)

    from supabase import create_client

    supabase_url, supabase_key = load_supabase_credentials()
    return create_client(supabase_url, supabase_key)


def load_config() -> MailPilotConfig:
    """
    Build a MailPilotConfig from environment variables.

    Raises:
        RuntimeError: if required configuration is missing.
    """
    _load_dotenv()

    validate_classifier_config()
    provider = get_ai_provider()
    openai_api_key = get_openai_api_key() if provider == "openai" else ""

    if flux_configured():
        supabase_url, supabase_service_role_key = "", ""
    else:
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
