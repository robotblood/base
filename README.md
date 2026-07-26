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

## Daily use (always-on)

One-time install (and re-run after changing `deploy/` or rebuilding the web app):

```bash
cd ~/base/web && npm run build   # production bundle (adapter-node)
bash ~/base/scripts/install-services.sh
```

That enables two systemd user services that start at login and restart on
failure — `base-api` (http://127.0.0.1:8000) and `base-web`
(http://localhost:3000) — and installs a **base** desktop entry that opens
the dashboard as its own app window. Postgres comes up with Docker
(`restart: unless-stopped`).

```bash
journalctl --user -u base-web -u base-api -f   # logs
systemctl --user restart base-web              # after a rebuild
```

## Admin

`/admin` in the dashboard operates the system rather than holding data. Sections
are registered in `web/src/lib/admin.ts` — adding one is a single entry.

Because base runs as a long-lived desktop window, a rebuild leaves that window
holding the previous client bundle — and the nav is built from code baked into
it, so a page added by the rebuild isn't there to click. `vite.config.ts` polls
`version.json` every 30s and the layout raises a **"A new build of base is
ready — Reload"** toast when it changes. If a new page seems missing, that
window predates it; reload.

**Health** (`/admin/health`) — the four processes base needs alive (`base-api`,
`base-web`, `base-backup.timer`, the `base-db` container), backup freshness,
database size and per-table footprint, disk headroom, the thumbnail cache, and
an on-demand check of every row whose `path` points at a folder on disk.

Host checks live in the *web* server (`web/src/lib/server/host.ts`), not the
API: a check that reports "base-api is down" can't be served by base-api. The
API contributes only what it owns — database reachability and footprint
(`app/health.py`, `GET /health` and `GET /health/paths`).

Broken paths are grouped by the missing directory they share, so an unplugged
drive reads as one fault ("`/media/robotblood/Main HD` — 71 rows need it")
rather than 71 unrelated ones.

**Design** (`/admin/design`) — the live design system. You author **seven
colours per mode** (background, surface, text, muted, border, accent,
on-accent) plus type, corner radius and density; `web/src/lib/design/tokens.ts`
derives the ~30 CSS variables the app actually reads (`--card`, `--popover`,
`--sidebar-*`, `--chart-*`, …) from them, in oklch, so "one step lighter" is
perceptually one step lighter. Contrast ratios are checked against WCAG as you
go.

Edits apply to the whole app immediately — the page previews itself, so the
sidebar and its own chrome move with the specimens. Tokens autosave to the
`settings` table, which means `pg_dump` already backs them up; `+layout.server.ts`
renders them into the page so the first paint is themed. Reset drops the row
and the built-in look returns.

The defaults reproduce base's existing Paper/Console identity exactly, so
nothing changed the day this shipped. Two things worth knowing:

- shadcn's `--accent` is the subtle *hover* surface, not a brand colour. The
  accent you pick becomes `--signal`, `--ring` and the chart series.
- The status colours in `$lib/status.ts` are deliberately **not** tokens. They
  encode meaning (blocked, overdue, done) and must not invert between themes.

## Backups

`install-services.sh` also enables **base-backup.timer** — a daily `pg_dump`
into `~/backups/base` (30 daily snapshots, plus the first of each month kept
for a year). `Persistent=true`, so a day the machine was off is caught up at
next login rather than skipped.

```bash
bash ~/base/scripts/backup.sh          # snapshot now
bash ~/base/scripts/restore.sh --list  # what's available
bash ~/base/scripts/restore.sh         # restore the newest (asks to confirm)
bash ~/base/scripts/restore.sh ~/backups/base/base-20260726-120000.dump
systemctl --user list-timers base-backup.timer
```

Restoring stops `base-api` first and dumps the current state to a
`pre-restore-*.dump` before replacing anything, so a restore of the wrong
snapshot is itself undoable. Dumps are `pg_dump -Fc`, so `pg_restore -l` lists
their contents and single tables can be pulled out of one.

The dumps live on the same machine as the database — that covers the failure
modes that actually happen (a bad migration, a mistaken bulk edit, a dropped
table), but not the disk dying. Copying `~/backups/base` somewhere else is
still worth doing.

## Development

```bash
systemctl --user stop base-api   # dev API wants port 8000
bash ~/base/scripts/dev.sh       # terminal 1: API with autoreload (docs at /docs)
bash ~/base/scripts/web.sh       # terminal 2: web with HMR at http://localhost:5173
```

Start `base-api` again when you're done (`systemctl --user start base-api`).
The vite dev server coexists fine with `base-web` (different ports).

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
