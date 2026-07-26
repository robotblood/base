from contextlib import asynccontextmanager
from datetime import date, datetime

from fastapi import FastAPI, Query
from sqlmodel import Session, func, select

from app import models
from app.db import engine, init_db
from app.health import db_health, path_health
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
]

# modules whose list should sort by something other than the title column
ORDER_OVERRIDES = {"events": ("starts_at", True)}  # (field, descending)

for model, name, title_field in MODULES:
    order_by, desc = ORDER_OVERRIDES.get(name, (None, False))
    app.include_router(make_crud_router(model, name, title_field, order_by=order_by, desc=desc))


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


@app.get("/dashboard")
def dashboard():
    """Actionable feed: what's overdue / due soon, in progress, waiting on,
    upcoming, and recent — the home screen's working view of the system."""
    today = date.today()
    horizon = today + timedelta(days=14)
    now = datetime.now()
    T, E, N, P = models.Todo, models.Event, models.Note, models.Project
    not_done = func.lower(func.coalesce(T.status, "")) != "done"

    with Session(engine) as session:
        def todos(where, order, limit=10):
            rows = session.exec(select(T).where(where).order_by(order).limit(limit)).all()
            return [_brief(t, ("id", "title", "due", "status", "priority")) for t in rows]

        overdue = todos(and_(T.due.is_not(None), T.due < today, not_done), T.due.asc())
        due_soon = todos(and_(T.due >= today, T.due <= horizon, not_done), T.due.asc())
        in_progress = todos(
            func.lower(func.coalesce(T.status, "")).in_(["in progress", "doing"]), T.due.asc()
        )
        waiting = todos(
            func.lower(func.coalesce(T.status, "")).in_(
                ["submitted", "draft", "waiting", "blocked", "in review", "review"]
            ),
            T.updated_at.desc(),
        )

        upcoming = session.exec(
            select(E).where(E.starts_at.is_not(None), E.starts_at >= now)
            .order_by(E.starts_at.asc()).limit(8)
        ).all()
        recent_meetings = session.exec(
            select(N).where(func.lower(func.coalesce(N.kind, "")) == "meeting")
            .order_by(func.coalesce(N.meeting_time, N.created_at).desc()).limit(6)
        ).all()
        active_projects = session.exec(
            select(P).where(
                func.lower(func.coalesce(P.status, "")).not_in(
                    ["done", "archived", "complete", "completed", "cancelled"]
                )
            ).order_by(P.name).limit(8)
        ).all()

    return {
        "today": today.isoformat(),
        "overdue": overdue,
        "due_soon": due_soon,
        "in_progress": in_progress,
        "waiting": waiting,
        "upcoming_events": [_brief(e, ("id", "title", "starts_at", "kind", "location")) for e in upcoming],
        "recent_meetings": [_brief(n, ("id", "title", "meeting_time", "meeting_type")) for n in recent_meetings],
        "active_projects": [_brief(p, ("id", "name", "status")) for p in active_projects],
    }
