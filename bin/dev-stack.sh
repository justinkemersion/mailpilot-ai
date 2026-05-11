#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_SCRIPT="$ROOT_DIR/bin/dev-web.sh"
RUNNER_SCRIPT="$ROOT_DIR/bin/dev-runner.sh"

prefix_output() {
  local prefix="$1"

  while IFS= read -r line; do
    printf '[%s] %s\n' "$prefix" "$line"
  done
}

start_process() {
  local name="$1"
  shift

  "$@" \
    > >(prefix_output "$name") \
    2> >(prefix_output "$name" >&2) &

  PIDS+=("$!")
}

stop_children() {
  local pid

  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}

declare -a PIDS=()
trap stop_children EXIT
trap 'exit 130' INT TERM

start_process web "$WEB_SCRIPT"
start_process runner "$RUNNER_SCRIPT"

printf 'MailPilot dev stack is running. Press Ctrl+C to stop.\n'

if wait -n "${PIDS[@]}"; then
  status=0
else
  status=$?
fi

printf 'A dev process exited with status %s. Shutting down the rest.\n' "$status" >&2
exit "$status"
