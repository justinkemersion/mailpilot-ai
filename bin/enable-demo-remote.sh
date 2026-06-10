#!/usr/bin/env bash
# Patch production .env.docker with visitor demo flags and redeploy web.
# Secrets stay on the server — this only adds/updates demo vars via SSH.
#
# Usage (from laptop, SSH key loaded):
#   ./bin/enable-demo-remote.sh
#   ./bin/enable-demo-remote.sh --deploy   # also git pull + rebuild web
#
# See _contract/deploy.md — env scp is allowed for secrets only.
set -euo pipefail

MAILPILOT_SYNC_SSH_USER="${MAILPILOT_SYNC_SSH_USER:-root}"
MAILPILOT_SYNC_SSH_HOST="${MAILPILOT_SYNC_SSH_HOST:-178.104.205.138}"
MAILPILOT_SYNC_REMOTE="${MAILPILOT_SYNC_REMOTE:-${MAILPILOT_SYNC_SSH_USER}@${MAILPILOT_SYNC_SSH_HOST}}"
MAILPILOT_REMOTE_REPO_ROOT="${MAILPILOT_REMOTE_REPO_ROOT:-/srv/apps/mailpilot-ai-git}"
DEPLOY=0

for a in "$@"; do
  case "$a" in
    --deploy) DEPLOY=1 ;;
    -h | --help)
      sed -n '3,12p' "$0" | sed 's/^# *//'
      exit 0
      ;;
    *)
      echo "Unknown option: $a" >&2
      exit 1
      ;;
  esac
done

REMOTE_SCRIPT=$(cat <<'EOS'
set -euo pipefail
ROOT="${MAILPILOT_REMOTE_REPO_ROOT:?}"
ENV_FILE="$ROOT/.env.docker"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing $ENV_FILE" >&2
  exit 1
fi
upsert() {
  local key="$1" val="$2" file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    printf '\n%s=%s\n' "$key" "$val" >> "$file"
  fi
}
upsert ENABLE_DEMO_MODE true "$ENV_FILE"
upsert NEXT_PUBLIC_ENABLE_DEMO_MODE true "$ENV_FILE"
echo "=== demo vars in $ENV_FILE ==="
grep -E '^(ENABLE_DEMO_MODE|NEXT_PUBLIC_ENABLE_DEMO_MODE)=' "$ENV_FILE"
EOS
)

echo "=== patching demo env on $MAILPILOT_SYNC_REMOTE ==="
ssh -o ConnectTimeout=15 "$MAILPILOT_SYNC_REMOTE" \
  "MAILPILOT_REMOTE_REPO_ROOT=$(printf %q "$MAILPILOT_REMOTE_REPO_ROOT") bash -s" <<< "$REMOTE_SCRIPT"

if [[ "$DEPLOY" -eq 1 ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  MAILPILOT_SKIP_RUNNER=1 exec "$SCRIPT_DIR/deploy-production.sh" --remote
fi
