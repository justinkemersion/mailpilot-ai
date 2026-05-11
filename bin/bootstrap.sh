#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER_DIR="$ROOT_DIR/mailpilot-runner"
WEB_DIR="$ROOT_DIR/mailpilot-web"
RUNNER_PYTHON="$RUNNER_DIR/.venv/bin/python"

runner_env_created=0
web_env_created=0

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

copy_if_missing() {
  local src="$1"
  local dest="$2"
  local created_flag="$3"

  if [[ -f "$dest" ]]; then
    printf 'Keeping existing %s\n' "$dest"
    return
  fi

  cp "$src" "$dest"
  printf 'Created %s from %s\n' "$dest" "$src"
  printf -v "$created_flag" '%s' 1
}

if ! command_exists npm; then
  printf 'npm is required to bootstrap the web app.\n' >&2
  exit 1
fi

if command_exists python3; then
  SYSTEM_PYTHON="python3"
elif command_exists python; then
  SYSTEM_PYTHON="python"
else
  printf 'python3 or python is required to bootstrap the runner.\n' >&2
  exit 1
fi

copy_if_missing "$RUNNER_DIR/.env.example" "$RUNNER_DIR/.env" runner_env_created
copy_if_missing "$WEB_DIR/.env.local.example" "$WEB_DIR/.env.local" web_env_created

if [[ ! -x "$RUNNER_PYTHON" ]]; then
  printf 'Creating runner virtualenv with %s\n' "$SYSTEM_PYTHON"
  "$SYSTEM_PYTHON" -m venv "$RUNNER_DIR/.venv"
else
  printf 'Keeping existing runner virtualenv at %s\n' "$RUNNER_DIR/.venv"
fi

printf 'Installing runner dependencies\n'
"$RUNNER_PYTHON" -m pip install -e "$RUNNER_DIR[dev]"

printf 'Installing web dependencies\n'
npm install --prefix "$WEB_DIR"

printf '\nBootstrap complete.\n'
printf 'Start the local stack with: %s\n' "$ROOT_DIR/bin/dev-stack.sh"

if ((runner_env_created || web_env_created)); then
  printf '\nReview and update any newly created env files before starting the app.\n'
fi
