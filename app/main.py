from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta

from fastapi import FastAPI, Query
from sqlalchemy import and_
from sqlmodel import Session, func, select

from app import models
from app.db import engine, init_db
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
]

# modules whose list should sort by something other than the title column
ORDER_OVERRIDES = {"events": ("starts_at", True)}  # (field, descending)

for model, name, title_field in MODULES:
    order_by, desc = ORDER_OVERRIDES.get(name, (None, False))
    app.include_router(make_crud_router(model, name, title_field, order_by=order_by, desc=desc))


@app.get("/")
def root():
    return {"service": "base", "modules": [m[1] for m in MODULES]}


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
