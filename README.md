# MailPilot AI

**An AI-driven inbox copilot** that reads intent—not just metadata—to tame Gmail. MailPilot is evolving from a powerful CLI into a multi-user, headless web application built to cure inbox anxiety.

## Vision

MailPilot acts as an **invisible chief of staff** for email. Large language models interpret what messages mean and what you likely need next, then help **categorize**, **archive** noise, and **highlight** what matters. The goal is a calm, trustworthy system that works in the background while you stay in control.

## Monorepo architecture

This repository holds two focused packages so the **engine** and **dashboard** can evolve independently while staying easy to ship and review together.

### Why a monorepo?

- Clear **separation of concerns**: background processing vs. user-facing auth and configuration.
- One place for **issues, CI**, and cross-cutting changes (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

### Layout

```text
mailpilot-ai/
├── mailpilot-runner/   # Python engine (CLI, Gmail, SQLite, workers)
├── mailpilot-web/      # Next.js dashboard (auth, OAuth UX, rules UI — evolving)
├── .github/            # CI workflows
└── LICENSE
```

### `mailpilot-runner` — the engine

A **Python** application that does the heavy lifting: **SQLite**, **Typer**, **OpenAI**, and the **Gmail API**. It runs as a **headless background worker** that fetches mail, classifies it with an LLM, and applies labels and safe actions. This is the source of truth for how processing works today; full setup and commands live in [`mailpilot-runner/README.md`](mailpilot-runner/README.md).

### `mailpilot-web` — the dashboard

An **upcoming** **Next.js** front end, planned to pair with **Supabase** for auth and data. It will own **user authentication**, **Google OAuth** flows in the browser, and a place to define **natural-language rules** for the inbox. The app is bootstrapped today; day-to-day Next.js commands are summarized below and in [`mailpilot-web/README.md`](mailpilot-web/README.md).

## Development setup

Open the **repository root** in your IDE (for example **Cursor**) so both `mailpilot-runner` and `mailpilot-web` appear in one workspace. That makes it easy to jump between the engine and the dashboard without juggling separate clones.

- **Python CLI and engine** — Create a local **`.venv`**, environment variables, Gmail/OpenAI credentials, and all Typer commands are documented in **[`mailpilot-runner/README.md`](mailpilot-runner/README.md)**. Start there to run the processor and manage accounts.
- **Web app** — From the repo root:

  ```bash
  cd mailpilot-web
  npm install
  npm run dev
  ```

  Then open [http://localhost:3000](http://localhost:3000). For template-level Next.js notes, see [`mailpilot-web/README.md`](mailpilot-web/README.md).

## Roadmap and future web features

- **SQLite → Supabase (PostgreSQL)** — Move from single-machine SQLite to a hosted, multi-tenant-friendly datastore aligned with web auth and dashboards.
- **Google OAuth: Desktop → Web app** — Migrate from a desktop-oriented OAuth flow to a **web application** flow suited to browser onboarding and the dashboard.
- **Natural language rules engine** — Let users describe policies in plain English, e.g. *“If my boss emails me asking for a report, label it Important.”*
- **Visual history and “undo” dashboard** — Surface processing history and safe undo in the UI, complementing the runner’s existing history and undo capabilities.

## License

See [`LICENSE`](LICENSE).
