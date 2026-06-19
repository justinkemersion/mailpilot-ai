# Schema mirror (Flux-only production)

MailPilot **production** uses **Flux** (`flux/migrations/`, schema `api`). This directory is a **reference mirror** of the Postgres shape (historically aligned with Supabase `public`).

- Apply schema changes in [`flux/migrations/`](../../flux/migrations/) and `flux push` to production.
- Files here support documentation and optional Supabase-shaped local tooling; they are **not** the production deploy path.

Web and runner access the database via Flux PostgREST (`NEXT_PUBLIC_FLUX_URL`, `FLUX_SERVICE_TOKEN`).
