#!/usr/bin/env bash
# Deploy MailPilot on a production host after code is pushed to git.
#
# Contract: commit → push → run this script on the server (or --remote from laptop).
# Never rsync/scp application source — see _contract/deploy.md.
#
# Usage (on server, from repo root):
#   sudo ./bin/deploy-production.sh
#
# Usage (from laptop over SSH — same defaults as Flux bin/sync-env-remote.sh):
#   ./bin/deploy-production.sh --remote
#
# Env overrides:
#   MAILPILOT_SYNC_REMOTE=root@host
#   MAILPILOT_REMOTE_REPO_ROOT=/srv/apps/mailpilot-ai-git
#   MAILPILOT_RUNNER_ENV=/etc/mailpilot/runner.env
#   MAILPILOT_SKIP_WEB=1       skip docker compose web rebuild
#   MAILPILOT_SKIP_RUNNER=1    skip systemd runner refresh/restart
#
set -euo pipefail

MAILPILOT_SYNC_SSH_USER="${MAILPILOT_SYNC_SSH_USER:-root}"
MAILPILOT_SYNC_SSH_HOST="${MAILPILOT_SYNC_SSH_HOST:-178.104.205.138}"
MAILPILOT_SYNC_REMOTE="${MAILPILOT_SYNC_REMOTE:-${MAILPILOT_SYNC_SSH_USER}@${MAILPILOT_SYNC_SSH_HOST}}"
MAILPILOT_REMOTE_REPO_ROOT="${MAILPILOT_REMOTE_REPO_ROOT:-/srv/apps/mailpilot-ai-git}"
MAILPILOT_RUNNER_ENV="${MAILPILOT_RUNNER_ENV:-/etc/mailpilot/runner.env}"
MAILPILOT_GIT_REF="${MAILPILOT_GIT_REF:-main}"
SKIP_WEB="${MAILPILOT_SKIP_WEB:-0}"
SKIP_RUNNER="${MAILPILOT_SKIP_RUNNER:-0}"
REMOTE=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  sed -n '3,20p' "$0" | sed 's/^# *//'
}

for a in "$@"; do
  case "$a" in
    -h | --help)
      usage
      exit 0
      ;;
    --remote)
      REMOTE=1
      ;;
    *)
      printf 'Unknown option: %s\n' "$a" >&2
      usage >&2
      exit 1
      ;;
  esac
done

run_deploy() {
  local root="$1"
  cd "$root"

  echo "=== git pull ($MAILPILOT_GIT_REF) ==="
  git fetch origin "$MAILPILOT_GIT_REF"
  git checkout "$MAILPILOT_GIT_REF"
  git pull --ff-only origin "$MAILPILOT_GIT_REF"

  if [[ "$SKIP_WEB" != "1" ]]; then
    if [[ ! -f "$root/.env.docker" ]]; then
      echo "WARN: $root/.env.docker missing — skipping web container rebuild" >&2
    elif command -v docker >/dev/null 2>&1; then
      echo "=== docker compose: rebuild web ==="
      docker compose --env-file "$root/.env.docker" build web
      docker compose --env-file "$root/.env.docker" up -d web
      docker compose --env-file "$root/.env.docker" ps web
    else
      echo "WARN: docker not found — skipping web rebuild" >&2
    fi
  else
    echo "=== skipping web (MAILPILOT_SKIP_WEB=1) ==="
  fi

  if [[ "$SKIP_RUNNER" != "1" ]]; then
    if [[ ! -f "$MAILPILOT_RUNNER_ENV" ]]; then
      echo "ERROR: runner env missing: $MAILPILOT_RUNNER_ENV" >&2
      exit 1
    fi
    echo "=== systemd runner: refresh venv and restart ==="
    "$root/bin/install-runner-systemd.sh" --env-file "$MAILPILOT_RUNNER_ENV"
  else
    echo "=== skipping runner (MAILPILOT_SKIP_RUNNER=1) ==="
  fi

  echo "=== deploy complete ==="
}

if [[ "$REMOTE" -eq 1 ]]; then
  echo "=== remote deploy: $MAILPILOT_SYNC_REMOTE:$MAILPILOT_REMOTE_REPO_ROOT ==="
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$MAILPILOT_SYNC_REMOTE" \
    "MAILPILOT_REMOTE_REPO_ROOT=$(printf %q "$MAILPILOT_REMOTE_REPO_ROOT") \
     MAILPILOT_RUNNER_ENV=$(printf %q "$MAILPILOT_RUNNER_ENV") \
     MAILPILOT_GIT_REF=$(printf %q "$MAILPILOT_GIT_REF") \
     MAILPILOT_SKIP_WEB=$(printf %q "$SKIP_WEB") \
     MAILPILOT_SKIP_RUNNER=$(printf %q "$SKIP_RUNNER") \
     bash -s" <<'REMOTE'
set -euo pipefail
ROOT="${MAILPILOT_REMOTE_REPO_ROOT:?}"
cd "$ROOT"
echo "=== git pull (bootstrap) ==="
git fetch origin "${MAILPILOT_GIT_REF:-main}"
git checkout "${MAILPILOT_GIT_REF:-main}"
git pull --ff-only origin "${MAILPILOT_GIT_REF:-main}"
export MAILPILOT_SKIP_WEB="${MAILPILOT_SKIP_WEB:-0}"
export MAILPILOT_SKIP_RUNNER="${MAILPILOT_SKIP_RUNNER:-0}"
export MAILPILOT_RUNNER_ENV="${MAILPILOT_RUNNER_ENV:-/etc/mailpilot/runner.env}"
exec "$ROOT/bin/deploy-production.sh"
REMOTE
  exit 0
fi

if [[ "$(id -u)" -ne 0 ]] && [[ "$SKIP_RUNNER" != "1" ]]; then
  printf 'Run as root for runner install (sudo %s), or set MAILPILOT_SKIP_RUNNER=1\n' "$0" >&2
  exit 1
fi

run_deploy "$REPO_ROOT"
