#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/mailpilot-web"

if ! command -v npm >/dev/null 2>&1; then
  printf 'npm is required to run the web app.\n' >&2
  exit 1
fi

if [[ ! -f "$WEB_DIR/.env.local" ]]; then
  printf 'Missing %s\n' "$WEB_DIR/.env.local" >&2
  printf 'Create it from %s and fill in the required values first.\n' "$WEB_DIR/.env.local.example" >&2
  exit 1
fi

if [[ ! -d "$WEB_DIR/node_modules" ]]; then
  printf 'Missing %s\n' "$WEB_DIR/node_modules" >&2
  printf 'Install dependencies first with: (cd %s && npm install)\n' "$WEB_DIR" >&2
  exit 1
fi

cd "$WEB_DIR"

if (($# > 0)); then
  exec npm run dev -- "$@"
fi

exec npm run dev
