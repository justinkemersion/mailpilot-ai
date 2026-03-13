import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv


_ROOT_DIR = Path(__file__).resolve().parent.parent
_DATA_DIR = _ROOT_DIR / "data"


def _load_dotenv() -> None:
    """
    Load environment variables from a .env file if present.

    This is safe in production because real env vars take precedence.
    """
    env_path = _ROOT_DIR / ".env"
    if env_path.exists():
        load_dotenv(env_path)


@dataclass(frozen=True)
class MailPilotConfig:
    openai_api_key: str
    gmail_credentials_file: Optional[Path]
    db_path: Path
    poll_interval_seconds: int
    log_level: str

    @property
    def db_path_str(self) -> str:
        return str(self.db_path)


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

    credentials_file_raw = os.getenv("GOOGLE_CREDENTIALS_FILE")
    gmail_credentials_file = (
        Path(credentials_file_raw).expanduser().resolve()
        if credentials_file_raw
        else None
    )

    db_path_raw = os.getenv("MAILPILOT_DB_PATH")
    if db_path_raw:
        db_path = Path(db_path_raw).expanduser().resolve()
    else:
        db_path = _DATA_DIR / "mailpilot.db"

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
        gmail_credentials_file=gmail_credentials_file,
        db_path=db_path,
        poll_interval_seconds=poll_interval_seconds,
        log_level=log_level,
    )
