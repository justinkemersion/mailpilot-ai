import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

import typer

from .cli import app as cli_app
from .config import MailPilotConfig, load_config
from .ui import render_config_error


def _configure_logging(config: MailPilotConfig) -> None:
    log_level = getattr(logging, config.log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    )

    # Also log to rotating file under data/logs
    root_dir = Path(__file__).resolve().parent.parent
    log_dir = root_dir / "data" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    file_handler = RotatingFileHandler(
        log_dir / "mailpilot.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
    )
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s - %(message)s")
    )
    logging.getLogger().addHandler(file_handler)


def main() -> None:
    """
    Entrypoint for MailPilot CLI.
    """
    # supabase-check only needs Supabase URL + service role key, not OpenAI.
    if len(sys.argv) > 1 and sys.argv[1] == "supabase-check":
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
        )
        typer.main.get_command(cli_app)()
        return

    try:
        config = load_config()
        _configure_logging(config)

        # Store config on Typer app state for commands to access.
        # Typer doesn't have formal state; use context object via typer.Context.
        typer.main.get_command(cli_app)()  # delegate to Typer
    except RuntimeError as exc:
        if render_config_error(exc):
            sys.exit(1)
        raise


if __name__ == "__main__":
    main()
