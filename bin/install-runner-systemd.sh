#!/usr/bin/env bash
# Install MailPilot watch-jobs as a systemd service (native venv, not Docker).
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER_DIR="$ROOT_DIR/mailpilot-runner"
PYTHON_BIN="$RUNNER_DIR/.venv/bin/python"
TEMPLATE_UNIT="$ROOT_DIR/deploy/systemd/mailpilot-runner.service"
INSTALLED_UNIT="/etc/systemd/system/mailpilot-runner.service"
ENV_DIR="/etc/mailpilot"
ENV_FILE="$ENV_DIR/runner.env"
SERVICE_USER="mailpilot"
SERVICE_GROUP="mailpilot"
POLL_INTERVAL="5"
ENV_SOURCE=""
ENABLE_START=1
STOP_DOCKER_RUNNER=1

usage() {
  cat <<'EOF'
Usage: install-runner-systemd.sh [options]

Installs mailpilot-runner.service and enables watch-jobs on this host.

Options:
  --root PATH           Repo root (default: parent of bin/)
  --env-file PATH       Copy to /etc/mailpilot/runner.env (default: ROOT/.env.runner)
  --user NAME           systemd User= (default: mailpilot)
  --poll-interval SEC   watch-jobs poll interval (default: 5)
  --no-enable           Install unit but do not enable/start
  --no-docker-stop      Do not stop mailpilot-runner Docker container
  -h, --help            Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      ROOT_DIR="$(cd -- "$2" && pwd)"
      RUNNER_DIR="$ROOT_DIR/mailpilot-runner"
      PYTHON_BIN="$RUNNER_DIR/.venv/bin/python"
      TEMPLATE_UNIT="$ROOT_DIR/deploy/systemd/mailpilot-runner.service"
      shift 2
      ;;
    --env-file)
      ENV_SOURCE="$2"
      shift 2
      ;;
    --user)
      SERVICE_USER="$2"
      SERVICE_GROUP="$2"
      shift 2
      ;;
    --poll-interval)
      POLL_INTERVAL="$2"
      shift 2
      ;;
    --no-enable)
      ENABLE_START=0
      shift
      ;;
    --no-docker-stop)
      STOP_DOCKER_RUNNER=0
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  printf 'Run as root (sudo %s)\n' "$0" >&2
  exit 1
fi

if [[ ! -f "$TEMPLATE_UNIT" ]]; then
  printf 'Missing unit template: %s\n' "$TEMPLATE_UNIT" >&2
  exit 1
fi

if [[ -z "$ENV_SOURCE" ]]; then
  ENV_SOURCE="$ROOT_DIR/.env.runner"
fi
if [[ ! -f "$ENV_SOURCE" ]]; then
  printf 'Missing env file: %s\n' "$ENV_SOURCE" >&2
  printf 'Create it from deploy/env/runner.env.example or mailpilot-runner/.env.example\n' >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  printf 'python3 is required on the host\n' >&2
  exit 1
fi

if ! id "$SERVICE_USER" &>/dev/null; then
  printf 'Creating system user %s\n' "$SERVICE_USER"
  useradd --system --home-dir /var/lib/mailpilot --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

chmod +x "$ROOT_DIR/bin/mailpilot-watch-jobs"

if [[ ! -x "$PYTHON_BIN" ]]; then
  printf 'Creating runner venv\n'
  python3 -m venv "$RUNNER_DIR/.venv"
fi

printf 'Installing runner package into venv\n'
"$PYTHON_BIN" -m pip install -q --upgrade pip
"$PYTHON_BIN" -m pip install -q -e "$RUNNER_DIR"

install -d -m 0750 -o root -g "$SERVICE_GROUP" "$ENV_DIR"
if [[ "$(readlink -f "$ENV_SOURCE")" == "$(readlink -f "$ENV_FILE")" ]]; then
  chown root:"$SERVICE_GROUP" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  printf 'Using existing %s\n' "$ENV_FILE"
else
  install -m 0640 -o root -g "$SERVICE_GROUP" "$ENV_SOURCE" "$ENV_FILE"
  printf 'Installed %s from %s\n' "$ENV_FILE" "$ENV_SOURCE"
fi

chown -R "$SERVICE_USER:$SERVICE_GROUP" "$RUNNER_DIR/.venv"
chmod -R o-rwx "$RUNNER_DIR/.venv"
# Repo scripts must be executable by the service user
chmod o+rx "$ROOT_DIR" "$ROOT_DIR/bin"
chmod o+rx "$RUNNER_DIR"
install -d -m 0755 -o "$SERVICE_USER" -g "$SERVICE_GROUP" /var/log/mailpilot

sed \
  -e "s|@MAILPILOT_ROOT@|$ROOT_DIR|g" \
  -e "s|@SERVICE_USER@|$SERVICE_USER|g" \
  -e "s|@SERVICE_GROUP@|$SERVICE_GROUP|g" \
  -e "s|@POLL_INTERVAL@|$POLL_INTERVAL|g" \
  "$TEMPLATE_UNIT" >"$INSTALLED_UNIT"
chmod 0644 "$INSTALLED_UNIT"
printf 'Installed %s\n' "$INSTALLED_UNIT"

if [[ "$STOP_DOCKER_RUNNER" -eq 1 ]] && command -v docker >/dev/null 2>&1; then
  if docker ps -a --format '{{.Names}}' | grep -qx 'mailpilot-runner'; then
    printf 'Stopping Docker container mailpilot-runner (systemd replaces it)\n'
    docker rm -f mailpilot-runner >/dev/null 2>&1 || true
  fi
  if [[ -f "$ROOT_DIR/docker-compose.yml" ]]; then
    (cd "$ROOT_DIR" && docker compose --env-file .env.docker stop runner 2>/dev/null) || true
  fi
fi

systemctl daemon-reload

if [[ "$ENABLE_START" -eq 1 ]]; then
  systemctl enable mailpilot-runner.service
  systemctl restart mailpilot-runner.service
  systemctl --no-pager status mailpilot-runner.service
else
  printf 'Unit installed. Enable with: systemctl enable --now mailpilot-runner\n'
fi
