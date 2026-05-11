#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER_DIR="$ROOT_DIR/mailpilot-runner"
PYTHON_BIN="$RUNNER_DIR/.venv/bin/python"

if [[ ! -f "$RUNNER_DIR/.env" ]]; then
  printf 'Missing %s\n' "$RUNNER_DIR/.env" >&2
  printf 'Create it from %s and fill in the required values first.\n' "$RUNNER_DIR/.env.example" >&2
  exit 1
fi

if [[ ! -x "$PYTHON_BIN" ]]; then
  printf 'Missing %s\n' "$PYTHON_BIN" >&2
  printf 'Create the runner venv first with: (cd %s && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]")\n' "$RUNNER_DIR" >&2
  exit 1
fi

cd "$RUNNER_DIR"
exec "$PYTHON_BIN" -m mailpilot.main watch-jobs "$@"
