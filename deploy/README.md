# MailPilot deployment helpers

**Contract:** [_contract/deploy.md](../_contract/deploy.md) — code reaches servers only via **git** (`commit` → `push` → `git pull`). Do not rsync or scp the repo tree.

Production layout on a single host:

| Component | Runtime | Notes |
|-----------|---------|--------|
| **Web** (`mailpilot-web`) | Docker Compose | Traefik TLS, `.env.docker` |
| **Runner** (`watch-jobs`) | **systemd** | Native venv, `/etc/mailpilot/runner.env` |

The runner does not need the Docker `flux-network`; it talks to Flux and Gmail over HTTPS.

## Web demo mode (showcase only)

The dashboard supports an optional **demo posture** for public showcases. Controlled by **server-only** env:

```bash
MAILPILOT_DEMO_MODE=true          # fixture data; blocks mutations — never in production
NEXT_PUBLIC_DEMO_BANNER=true      # optional dismissible banner (UI only)
```

**Production:** `MAILPILOT_DEMO_MODE` must be **absent or `false`** in `.env.docker` and any host env. Demo mode must not be enabled on the live personal instance unless you intend a read-only public demo.

Details: [`mailpilot-web/README.md`](../mailpilot-web/README.md#demo--showcase-mode).

## systemd runner (recommended)

### 1. Prepare environment

Copy and edit secrets (never commit the real file):

```bash
sudo install -d -m 0750 -o root -g mailpilot /etc/mailpilot
sudo cp deploy/env/runner.env.example /etc/mailpilot/runner.env
sudo chmod 0640 /etc/mailpilot/runner.env
sudo chown root:mailpilot /etc/mailpilot/runner.env
# edit /etc/mailpilot/runner.env — FLUX_*, OPENAI_API_KEY, etc.
```

Or point the install script at an existing repo file:

```bash
./bin/install-runner-systemd.sh --env-file /srv/apps/mailpilot-ai-git/.env.runner
```

### 2. Install and start

From the repo root (as root):

```bash
chmod +x bin/mailpilot-watch-jobs bin/install-runner-systemd.sh
./bin/install-runner-systemd.sh
```

Options:

| Flag | Default | Purpose |
|------|---------|---------|
| `--root` | repo root | Checkout path |
| `--env-file` | `$ROOT/.env.runner` | Source env copied to `/etc/mailpilot/runner.env` |
| `--user` | `mailpilot` | systemd `User=` |
| `--poll-interval` | `5` | `watch-jobs` seconds |
| `--no-docker-stop` | — | Leave `mailpilot-runner` container running |
| `--no-enable` | — | Install unit only, do not enable/start |

### 3. Operate

```bash
sudo systemctl status mailpilot-runner
sudo journalctl -u mailpilot-runner -f
sudo systemctl restart mailpilot-runner
```

Health check (no OpenAI key required for DB-only check):

```bash
sudo -u mailpilot /path/to/repo/mailpilot-runner/.venv/bin/python -m mailpilot.main supabase-check
```

Environment is loaded from `/etc/mailpilot/runner.env` when run under systemd.

### 4. After code updates

```bash
cd /srv/apps/mailpilot-ai-git   # or your checkout path
sudo ./bin/deploy-production.sh
```

Or from your laptop (SSH defaults match Flux `bin/sync-env-remote.sh`):

```bash
./bin/deploy-production.sh --remote
```

This pulls `main`, rebuilds the **web** container, refreshes the runner venv via `install-runner-systemd.sh`, and restarts `mailpilot-runner`. Skip steps with `MAILPILOT_SKIP_WEB=1` or `MAILPILOT_SKIP_RUNNER=1`.

Manual equivalent:

```bash
git pull origin main
sudo ./bin/install-runner-systemd.sh --env-file /etc/mailpilot/runner.env
docker compose --env-file .env.docker up -d --build web
```

## Docker runner (optional)

For all-in-Docker dev or hosts without systemd:

```bash
docker compose --profile docker-runner up -d runner
```

Default `docker compose up` starts **web only**; use the profile above if you still want the containerized worker.

## Uninstall systemd runner

```bash
sudo systemctl disable --now mailpilot-runner
sudo rm -f /etc/systemd/system/mailpilot-runner.service
sudo systemctl daemon-reload
```
