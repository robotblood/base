# base — Rust port

The beginning of the Rust rewrite of base's backend: an [axum](https://github.com/tokio-rs/axum) +
[SQLx](https://github.com/launchbadge/sqlx) server that speaks the **same HTTP API against the
same Postgres database** as the FastAPI app in `../app`. The SvelteKit dashboard in `../web`
doesn't change — it can point at either server, which is what makes the migration incremental
instead of a big-bang rewrite.

This directory is deliberately self-contained (own Cargo workspace, own README) so it can be
lifted into its own repository once one exists for it.

```
rust/
├── Cargo.toml            # workspace
└── server/               # the API server crate (base-server)
    └── src/
        ├── main.rs       # router + startup
        ├── config.rs     # env / .env resolution (reads the repo's ../.env)
        ├── modules.rs    # the module registry — twin of MODULES in app/main.py
        ├── db.rs         # pool, live-schema introspection, generated CRUD SQL
        ├── crud.rs       # generic CRUD handlers — twin of app/routers
        ├── system.rs     # /, /health, /stats, /tags, /settings/{key}
        └── error.rs      # FastAPI-shaped errors ({"detail": ...})
```

## Design notes

- **The Python side still owns the schema.** This server creates no tables; at boot it
  introspects each module table and generates its CRUD SQL from the columns that actually
  exist. Add a column to `app/models.py`, restart both servers, and it's live here too.
- **Writes go through `jsonb_populate_record`.** The payload binds as one JSONB value and
  Postgres casts each field to the column's real type (dates, timestamps, `text[]`, JSONB
  documents). That keeps the handlers as generic as `make_crud_router` — no typed struct
  per table, no drift when the schema moves.
- **Same shapes on the wire.** Rows come back flat with the `extras` blob (user-added
  fields) spread in, real columns winning collisions; unknown payload keys are collected
  into `extras`; errors are `{"detail": ...}`. The web layer shouldn't be able to tell
  which server answered.
- **Model defaults live in the registry.** SQLModel applies field defaults in Python, not
  in the database, so `modules.rs` carries them (`notes.kind = "note"`, `todos.status =
  "To Do"`, …) and applies them at insert.

## Running

```bash
cd rust
cargo run -p base-server
```

Configuration resolves like `app/config.py`: environment variables first
(`DATABASE_URL`, `API_HOST`, `API_PORT`), then the repo's `.env`, then defaults.
The SQLAlchemy-style `postgresql+psycopg://` scheme in an existing `.env` is
accepted and normalized. **Default port is 8001** (FastAPI holds 8000) so both
servers run side by side while the port is proven out; set `API_PORT=8000` to
take over serving the dashboard.

Smoke test against a live database:

```bash
curl -s localhost:8001/health | jq .api
curl -s localhost:8001/stats
curl -s "localhost:8001/todos?q=mix&limit=5"
```

## Parity

Verified head-to-head: with both servers on one database, `/`, `/stats`, `/todos`,
`/events` and record reads return byte-identical JSON (after key sort). The one
cosmetic difference: Python pads timestamp microseconds to six digits
(`.124830`) where Postgres's JSON formatter trims trailing zeros (`.12483`) —
both valid ISO-8601, indistinguishable once parsed.

Ported and serving:

- [x] Generic CRUD for all 15 modules (list with `?q=`/`limit`/`offset`, create,
      read, patch, delete) with extras flattening and per-module ordering
      (events by `starts_at` desc)
- [x] `GET /` (service + module list)
- [x] `GET /health` (full db footprint reading from app/health.py)
- [x] `GET /stats` (per-module counts + `_assist_pending` badge)
- [x] `GET /tags` (shared tag vocabulary, most-used first, `?module=` scope)
- [x] `GET|PUT|DELETE /settings/{key}`

Still on the Python side (the roadmap, roughly in dependency order):

- [ ] Row trash + delete checkpoints (`/trash`, app/trash.py) — deletes here are
      currently *permanent*, the one behavioral gap in the ported surface
- [ ] Revisions (`/revisions`, checkpoint-before-update for notes/projects)
- [ ] Custom tables (`/tables`, `/x/{key}`, `/archives`)
- [ ] Extension fields registry (`/fields`)
- [ ] Project date inheritance (`due_effective`/`due_from` decoration, app/inherit.py)
- [ ] `/dashboard` (the home screen feed)
- [ ] System log (`/log`, `/log/checks`, `/log/summary`)
- [ ] `/health/paths` (on-disk path checking)
- [ ] Assist (rules lane, queue, scheduler — app/assist.py)
- [ ] Schema ownership (migrations move here; Python side retires)
