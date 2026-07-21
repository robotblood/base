# base — personal system

A self-hosted replacement for the personal/creative side of a Notion workspace:
**PostgreSQL + FastAPI + a SvelteKit web dashboard**. Modules: todos, notes &
meetings, calendar, hardware, software, projects, media, people.

```
base/
├── docker-compose.yml     # Postgres 16
├── app/                   # FastAPI backend
│   ├── models.py          # SQLModel tables (schema)
│   ├── routers/           # generic CRUD per module
│   └── main.py            # app + /stats
├── importer/              # Notion export -> Postgres
│   ├── notion.py          # CSV + markdown parsing
│   ├── mappings.py        # which Notion DB maps to which table
│   └── run_import.py      # `python -m importer.run_import`
├── web/                   # SvelteKit web dashboard (front end)
└── scripts/               # bootstrap / setup / dev / web / import
```

## First-time setup

1. **System packages + Postgres** (one command, needs sudo):
   ```bash
   sudo bash ~/base/scripts/bootstrap.sh
   ```
2. **Python environment** (no sudo):
   ```bash
   bash ~/base/scripts/setup.sh
   ```
3. **Node.js** — if you don't already have Node 20+ (for the web dashboard):
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.nvm/nvm.sh && nvm install --lts
   ```
4. **Web dependencies** (no sudo):
   ```bash
   bash ~/base/scripts/web-setup.sh
   ```
5. **Import your Notion data**:
   ```bash
   bash ~/base/scripts/import.sh --wipe
   ```

## Daily use

```bash
bash ~/base/scripts/dev.sh     # terminal 1: API at http://127.0.0.1:8000 (docs at /docs)
bash ~/base/scripts/web.sh     # terminal 2: web dashboard at http://localhost:5173
```

The web app reaches the API from its own server (SvelteKit `load` functions +
form actions), so the browser only ever talks to the dashboard — no CORS, and
the pages render server-side.

## Notes

- Backend connection settings live in `.env` (`NOTION_EXPORT_DIR` points at the
  export root). The web app reads the API location from `web/.env`
  (`API_BASE_URL`, default `http://127.0.0.1:8000`).
- Every imported row keeps a `raw` JSONB copy of its original Notion fields, so
  nothing from the export is lost even if a column isn't mapped yet.
- Re-running the import is idempotent (rows match on source + title).
- To add another Notion database, add a `Spec` to `importer/mappings.py`.
- To surface a new module in the web app, register it in `app/main.py` (backend)
  and `web/src/lib/modules.ts` (front end).
```
