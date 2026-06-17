# Phase 9 — Archive policy environment inventory

Runner-side flags that affect whether labeled mail is archived today (pre–PolicyResolver).

| Variable | Default | Effect |
|----------|---------|--------|
| `MAILPILOT_ARCHIVE_RECEIPTS` | `0` | When `1`, receipt category messages are archived (subject to caps and safe senders). |
| `MAILPILOT_ARCHIVE_SECURITY_NOISE` | `0` | When `1`, routine security noise maps to newsletters and may be archived. |
| `MAILPILOT_MAX_ARCHIVES_PER_RUN` | `30` | Cap on archive actions per sync run. |
| `MAILPILOT_MAX_LABEL_ACTIONS_PER_RUN` | `200` | Cap on label modify actions per run. |
| `MAILPILOT_MAX_SPAM_MARKS_PER_RUN` | `10` | Cap on spam label actions per run. |
| `MAILPILOT_LEGACY_AUTO_ARCHIVE` | `0` | When `1`, newsletters/promotions keep pre–Phase 9 auto-archive during transition. |
| `MAILPILOT_SAFE_SENDERS` | (empty) | Comma-separated emails that skip archive for newsletters/promotions/receipts. |
| `MAILPILOT_SAFE_SENDER_DOMAINS` | (empty) | Comma-separated domains with the same effect. |

**Baseline metrics:** Each run’s `run_jobs.result` JSON includes:

- `labeled_not_archived_by_category` — counts of messages that received MailPilot labels but remained in INBOX, keyed by category slug.
- `archive_policy_env` — snapshot of the boolean/int flags above at run start.
- `policy_previews` — when legacy and new policy differ, entries like `current_behavior: archive` → `new_policy: ask_first`.

See [`plans/mailpilot-phase-9-scoped-inbox-resolution.md`](../plans/mailpilot-phase-9-scoped-inbox-resolution.md) for the resolution product model and migration away from implicit auto-archive.
