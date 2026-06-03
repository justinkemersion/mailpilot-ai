# Deploy contract

Production and staging hosts must run **revisioned code from git**, not ad-hoc copies from a developer machine.

## Non-negotiable

1. **Commit and push** changes to the canonical remote (`origin`) before deploying.
2. On the server, **update only via `git pull`** (or `git fetch` + `git checkout` of a named ref) inside the app checkout.
3. Run documented install steps after pull (e.g. `./bin/install-runner-systemd.sh`, `docker compose build`, `flux push` for schema) — see [`deploy/README.md`](../deploy/README.md).

## Forbidden without written excuse

- `rsync`, `scp` of source trees, or hand-copying repo directories to “sync” application code
- Deploying uncommitted local working-tree state
- Editing application source on the server outside of a git checkout update

Secrets (`.env.docker`, `.env.runner`, `/etc/mailpilot/runner.env`) are **not** in git; copying env files with `scp` is allowed only for secrets, never for substituting a git pull of code.

## Valid exceptions (document in commit, plan, or ops note)

- Emergency hotfix when git/remote is unreachable (revert to git as soon as possible)
- Initial host bootstrap before the first clone exists
- Artifact deploys that are not the MailPilot git tree (e.g. container images built in CI from a SHA)

## Agent workflow

When deploying MailPilot: `git push` → SSH → `cd <checkout> && git pull` → service install/restart. Do not use rsync for code.
