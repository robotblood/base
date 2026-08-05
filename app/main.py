import traceback
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta, timezone

from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse
from sqlmodel import Session, func, select

from app import logs, models
from app.custom import make_custom_routers
from app.db import engine, init_db
from app.health import db_health, path_health
from app.inherit import decorate_projects
from app.revisions import router as revisions_router
from app.routers import make_crud_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="base — personal system API", version="0.1.0", lifespan=lifespan)

# (model, url segment, title/name column)
MODULES = [
    (models.Todo, "todos", "title"),
    (models.Note, "notes", "title"),
    (models.Event, "events", "title"),
    (models.Hardware, "hardware", "name"),
    (models.Software, "software", "name"),
    (models.Project, "projects", "name"),
    (models.Media, "media", "title"),
    (models.Person, "people", "name"),
    (models.Merch, "merch", "name"),
    (models.JobApplication, "applications", "role"),
    (models.Transaction, "transactions", "name"),
    (models.Budget, "budgets", "name"),
    (models.Learning, "learning", "name"),
    (models.Incident, "incidents", "title"),
    (models.Collection, "collections", "title"),
]

# modules whose list should sort by something other than the title column
ORDER_OVERRIDES = {"events": ("starts_at", True)}  # (field, descending)

# Read-only fields computed from other rows on the way out (app/inherit.py).
DECORATORS = {"projects": decorate_projects}

# Modules whose old state checkpoints before an update overwrites it — the
# ones where a lost body/document is real work gone (see app/revisions.py).
REVISIONED = {"notes", "projects"}

for model, name, title_field in MODULES:
    order_by, desc = ORDER_OVERRIDES.get(name, (None, False))
    app.include_router(
        make_crud_router(
            model, name, title_field,
            order_by=order_by, desc=desc, decorate=DECORATORS.get(name),
            revisions=name in REVISIONED,
        )
    )

# User-defined tables: /tables (schema registry) + /x/{key} (row CRUD).
for router in make_custom_routers({name for _, name, _ in MODULES}):
    app.include_router(router)

# Record history: list checkpoints, read one back.
app.include_router(revisions_router)


# Modules whose rows point at an on-disk folder, for the admin path check.
PATH_MODULES = [(m, n, t) for m, n, t in MODULES if hasattr(m, "path")]


@app.get("/")
def root():
    return {"service": "base", "modules": [m[1] for m in MODULES]}


@app.get("/health")
def health():
    """Database reachability and footprint. Cheap enough to poll."""
    return {"api": {"ok": True, "version": app.version}, "db": db_health()}


@app.get("/health/paths")
def health_paths():
    """Rows whose on-disk `path` no longer exists. Hits the filesystem — the
    admin page loads it on demand rather than with every health poll."""
    return path_health(PATH_MODULES)


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    """Record anything that escapes a route before returning the 500.

    Without this an API error exists only as a uvicorn traceback in journald —
    real, but invisible unless you already suspected something was wrong.
    """
    logs.log(
        "http.error",
        f"{type(exc).__name__}: {exc}",
        level="error",
        source="api",
        detail={
            "method": request.method,
            "path": request.url.path,
            "traceback": traceback.format_exc()[-4000:],
        },
    )
    return JSONResponse({"detail": "internal server error"}, status_code=500)


@app.get("/log")
def get_log(
    level: str | None = Query(default=None, description="this level or worse"),
    source: str | None = None,
    event: str | None = None,
    q: str | None = Query(default=None, description="substring of the message"),
    since_hours: int | None = None,
    limit: int = 200,
):
    """Recent system log entries, newest first."""
    return logs.read(
        level=level, source=source, event=event, q=q, since_hours=since_hours, limit=limit
    )


@app.get("/log/checks")
def log_check_history(hours: int = 48):
    """Per-check pass/fail history — the trend a live health reading can't show."""
    return {"hours": hours, "sources": logs.sources(), "series": logs.check_history(hours)}


@app.post("/log", status_code=204)
def post_log(entry: dict):
    """Append an entry. Used by the web layer and the shell scripts, which have
    no database connection of their own."""
    logs.log(
        str(entry.get("event", "")),
        str(entry.get("message", "")),
        level=str(entry.get("level", "info")),
        source=str(entry.get("source", "api")),
        detail=entry.get("detail") if isinstance(entry.get("detail"), dict) else {},
    )


@app.get("/log/summary")
def log_summary(hours: int = 24):
    """Counts by level over a window, plus the latest result of every check."""
    return {
        **logs.summary(hours),
        "checks": logs.latest_by_event("check."),
    }


@app.get("/settings/{key}")
def get_setting(key: str):
    """A stored settings blob, or `{}` when nothing has been saved yet.

    Returning empty rather than 404 keeps callers simple: the design page fills
    an unset config from its own defaults, so "never saved" and "saved as
    defaults" behave identically."""
    with Session(engine) as session:
        row = session.get(models.Setting, key)
        return row.value if row else {}


@app.put("/settings/{key}")
def put_setting(key: str, value: dict):
    """Upsert a settings blob. Stored whole — these are documents, not rows."""
    with Session(engine) as session:
        row = session.get(models.Setting, key)
        if row:
            row.value = value
            row.updated_at = models.utcnow()
        else:
            row = models.Setting(key=key, value=value)
        session.add(row)
        session.commit()
        session.refresh(row)
        return row.value


@app.delete("/settings/{key}", status_code=204)
def delete_setting(key: str):
    """Drop a settings blob so its owner falls back to defaults."""
    with Session(engine) as session:
        row = session.get(models.Setting, key)
        if row:
            session.delete(row)
            session.commit()


@app.get("/tags")
def tags(module: str | None = Query(default=None, description="limit to one module's tags")):
    """Distinct tags already in use, most-used first. Powers the tag picker so
    you can reuse existing tags instead of retyping them. Spans every module by
    default (tags are shared vocabulary), or pass ?module= to scope to one."""
    counts: dict[str, int] = {}
    with Session(engine) as session:
        for model, name, _ in MODULES:
            if module and name != module:
                continue
            for arr in session.exec(select(model.tags)).all():
                for t in arr or []:
                    if t:
                        counts[t] = counts.get(t, 0) + 1
    return sorted(counts, key=lambda t: (-counts[t], t.lower()))


@app.get("/stats")
def stats():
    """Row counts per module — powers the dashboard home screen."""
    out = {}
    with Session(engine) as session:
        for model, name, _ in MODULES:
            out[name] = session.exec(select(func.count()).select_from(model)).one()
    return out


def _brief(obj, fields: tuple[str, ...]) -> dict:
    return {f: getattr(obj, f, None) for f in fields}


# Project statuses that mean "not a live thread any more".
# Both spellings on purpose: the tracker's Archive stage writes "Archive",
# while the archive import wrote "archived". Comparison is lower-cased, so
# missing one would leave archived projects reading as live threads.
_PROJECT_CLOSED = ["done", "archive", "archived", "complete", "completed", "cancelled"]
# The same idea for todos — mirrors `doneValues` for todos in
# web/src/lib/modules.ts, so the counts here match what the list shows.
# Archived is work that closed out without being finished.
_TODO_CLOSED = ["done", "archived"]
# Phases seeded by a kind preset but never named carry no information, so they
# don't get to be a project's "next action".
_PLACEHOLDER_PHASE = {"", "new phase", "untitled"}


def _next_action(phases) -> str | None:
    """A project's next move: the phase in flight, else the first one waiting.
    Returns None when the phases are unset or still placeholders — the home
    screen says "no phase set" rather than inventing progress."""
    rows = [p for p in (phases or []) if isinstance(p, dict)]
    ordered = [p for p in rows if p.get("status") == "active"]
    ordered += [p for p in rows if p.get("status") == "todo"]
    for phase in ordered:
        name = str(phase.get("name") or "").strip()
        if name.lower() not in _PLACEHOLDER_PHASE:
            return name
    return None


@app.get("/dashboard")
def dashboard():
    """The home screen, organised by *thread* rather than by record status.

    This system holds a handful of live projects and a few big dates, not a
    queue of dated tickets — so the feed is one entry per live project (its
    next phase, its rollup counts, and for live shows its upcoming dates),
    plus loose ends and the notes most recently worked on.
    """
    today = date.today()
    now = datetime.now()
    T, E, N, P = models.Todo, models.Event, models.Note, models.Project
    not_done = func.lower(func.coalesce(T.status, "")).not_in(_TODO_CLOSED)

    with Session(engine) as session:
        projects = session.exec(
            select(P)
            .where(func.lower(func.coalesce(P.status, "")).not_in(_PROJECT_CLOSED))
            .order_by(P.name)
            .limit(12)
        ).all()
        pids = [p.id for p in projects]

        # Rollups in one query each rather than per project.
        def counts_by_project(stmt):
            return {pid: n for pid, n in session.exec(stmt).all() if pid is not None}

        tasks = (
            counts_by_project(
                select(T.project_id, func.count())
                .where(T.project_id.in_(pids), not_done)
                .group_by(T.project_id)
            )
            if pids
            else {}
        )
        notes = (
            counts_by_project(
                select(N.project_id, func.count())
                .where(N.project_id.in_(pids))
                .group_by(N.project_id)
            )
            if pids
            else {}
        )

        # Upcoming performances, grouped onto their project. Advance state
        # lives in the show doc, so the thread can say what still needs work.
        shows: dict[int, list[dict]] = {}
        if pids:
            rows = session.exec(
                select(E)
                .where(
                    E.project_id.in_(pids),
                    E.kind == "performance",
                    E.starts_at.is_not(None),
                    E.starts_at >= now,
                )
                .order_by(E.starts_at.asc())
            ).all()
            for e in rows:
                entry = _brief(e, ("id", "title", "starts_at", "location", "status"))
                entry["advance"] = (e.show or {}).get("advance")
                shows.setdefault(e.project_id, []).append(entry)

        # Resolve inherited dates once for the whole set, so a child project
        # counts down to the deadline it actually works to (app/inherit.py).
        inherited = {row["id"]: row for row in decorate_projects(list(projects), session)}

        threads = []
        for p in projects:
            mine = shows.get(p.id, [])
            resolved = inherited.get(p.id, {})
            threads.append(
                {
                    **_brief(p, ("id", "name", "kind", "status", "health", "due")),
                    # What this project is working to, and where it came from —
                    # null `due_from` means the date is its own.
                    "due_effective": resolved.get("due_effective"),
                    "due_from": resolved.get("due_from"),
                    "next_action": _next_action(p.phases),
                    "counts": {
                        "tasks": tasks.get(p.id, 0),
                        "notes": notes.get(p.id, 0),
                        "shows": len(mine),
                    },
                    "shows": mine,
                    # A date to count down to: the first show, else the due date.
                    "opens_at": mine[0]["starts_at"].isoformat() if mine else None,
                    # Advance is only tracked on performances; "Advanced" is the
                    # finished state, so anything else still needs a call.
                    "unadvanced": sum(1 for s in mine if s["advance"] != "Advanced"),
                }
            )

        # Notes you actually touched, newest first — imported rows sink as soon
        # as anything real is edited. The newest weekly note pins to the top:
        # it's the running workspace, so it should never scroll out of reach,
        # and each new week's note takes the spot from the last.
        current_weekly = session.exec(
            select(N)
            .where(N.kind == "weekly")
            .order_by(func.coalesce(N.meeting_time, N.created_at).desc())
            .limit(1)
        ).first()
        recent_notes = session.exec(
            select(N).order_by(func.coalesce(N.updated_at, N.created_at).desc()).limit(6)
        ).all()
        if current_weekly:
            recent_notes = [current_weekly] + [n for n in recent_notes if n.id != current_weekly.id]
            recent_notes = recent_notes[:6]

        # Where you left off — the records most recently written to, across the
        # modules where work actually happens (note bodies, project documents,
        # show sheets). Todos stay out: quick capture stamps one every time, and
        # a captured stray isn't a place to resume. The current weekly is out
        # too — it's pinned in the notes rail and would hold a slot forever.
        # The cutoff keeps the strip empty rather than dredging up rows whose
        # updated_at is just the import run.
        cutoff = models.utcnow() - timedelta(days=14)
        activity: list[dict] = []
        for model, mod, title_field in ((N, "notes", "title"), (P, "projects", "name"), (E, "events", "title")):
            for row in session.exec(
                select(model)
                .where(model.updated_at >= cutoff)
                .order_by(model.updated_at.desc())
                .limit(4)
            ).all():
                if mod == "notes" and current_weekly and row.id == current_weekly.id:
                    continue
                activity.append(
                    {
                        "module": mod,
                        "id": row.id,
                        "title": getattr(row, title_field),
                        "kind": getattr(row, "kind", None),
                        "updated_at": row.updated_at,
                    }
                )
        activity.sort(key=lambda a: a["updated_at"], reverse=True)

        overdue = session.exec(
            select(T).where(T.due.is_not(None), T.due < today, not_done).order_by(T.due.asc()).limit(6)
        ).all()
        undated = session.exec(
            select(func.count()).select_from(T).where(T.due.is_(None), not_done)
        ).one()
        open_total = session.exec(select(func.count()).select_from(T).where(not_done)).one()

        # The day's score so far: todos actually finished today. "Done" only,
        # not "archived" — archiving old junk is cleanup, not momentum.
        # updated_at is stamped UTC, so today's local midnight converts before
        # the comparison. A text edit to an already-done todo re-counts it;
        # close enough for a morale number.
        midnight_utc = (
            datetime.combine(today, time.min)
            .astimezone()
            .astimezone(timezone.utc)
            .replace(tzinfo=None)
        )
        done_today = session.exec(
            select(func.count())
            .select_from(T)
            .where(
                func.lower(func.coalesce(T.status, "")) == "done",
                T.updated_at >= midnight_utc,
            )
        ).one()

    return {
        "today": today.isoformat(),
        "threads": threads,
        "recent_activity": activity[:3],
        "recent_notes": [
            _brief(n, ("id", "title", "kind", "updated_at", "project_id")) for n in recent_notes
        ],
        "loose": {
            "overdue": [_brief(t, ("id", "title", "due", "status", "priority")) for t in overdue],
            "undated": undated,
            "open_total": open_total,
        },
        "done_today": done_today,
    }
