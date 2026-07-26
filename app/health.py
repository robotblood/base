"""Database-side health: is Postgres reachable, and what is it holding?

Deliberately narrow. Anything that reports on *this process* (is base-api up?)
belongs in the web layer instead — a health check that can only answer while the
API is running cannot tell you the API is down, which is the one moment you need
it to.
"""
import os
from datetime import datetime, timezone

from sqlalchemy import text
from sqlmodel import Session, select

from app.db import engine

_SIZE_SQL = text(
    """
    SELECT c.relname AS table_name,
           c.reltuples::bigint AS est_rows,
           pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname = 'public'
     ORDER BY pg_total_relation_size(c.oid) DESC
    """
)


def db_health() -> dict:
    """Connectivity, version, size, activity, and per-table footprint.

    Row counts come from ``reltuples`` (the planner's estimate) rather than
    ``count(*)`` per table: this endpoint gets polled, and exact counts are
    already available from ``/stats``. The estimate is what tells you a table is
    bloated or hasn't been analysed, which is the question a health page asks.
    """
    started = datetime.now(timezone.utc)
    try:
        with Session(engine) as session:
            one = lambda sql: session.execute(text(sql)).one()[0]  # noqa: E731
            db_name = one("SELECT current_database()")
            version = one("SHOW server_version")
            size_bytes = one("SELECT pg_database_size(current_database())")
            connections = one(
                "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()"
            )
            max_conn = int(one("SHOW max_connections"))
            postmaster_started = one("SELECT pg_postmaster_start_time()")
            tables = [
                {
                    "table": r[0],
                    "est_rows": max(int(r[1] or 0), 0),
                    "bytes": int(r[2]),
                }
                for r in session.execute(_SIZE_SQL).all()
            ]
    except Exception as exc:  # noqa: BLE001 — any failure here means "database unreachable"
        return {
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
            "checked_at": started.isoformat(),
        }

    return {
        "ok": True,
        "database": db_name,
        "version": version,
        "size_bytes": int(size_bytes),
        "connections": int(connections),
        "max_connections": max_conn,
        "started_at": postmaster_started.isoformat() if postmaster_started else None,
        "tables": tables,
        "query_ms": round((datetime.now(timezone.utc) - started).total_seconds() * 1000, 1),
        "checked_at": started.isoformat(),
    }


def _missing_root(path: str) -> str:
    """The shallowest ancestor of ``path`` that does not exist.

    An unplugged drive breaks every row that lived on it at once. Reporting
    those as N independent broken paths buries the actual fault; reporting the
    one directory that went missing names it.
    """
    parts = os.path.abspath(path).split(os.sep)
    for i in range(2, len(parts) + 1):
        candidate = os.sep.join(parts[:i]) or os.sep
        if not os.path.exists(candidate):
            return candidate
    return path


def path_health(specs: list[tuple[type, str, str]]) -> dict:
    """Which rows carry an on-disk ``path`` that no longer resolves.

    Projects, hardware, people and the rest point at real folders; those get
    moved and renamed constantly and nothing else in the app notices. Broken
    paths are also grouped by the missing directory they share, so an unmounted
    volume reads as one fault ("Main HD is not mounted, 71 rows need it")
    instead of 71.
    """
    modules: dict[str, dict] = {}
    groups: dict[str, dict] = {}

    with Session(engine) as session:
        for model, name, title_field in specs:
            rows = session.exec(
                select(model).where(model.path.is_not(None), model.path != "")
            ).all()
            broken = []
            for row in rows:
                path = os.path.expanduser(str(row.path))
                if os.path.exists(path):
                    continue
                entry = {"id": row.id, "label": getattr(row, title_field, None), "path": row.path}
                broken.append(entry)
                root = _missing_root(path)
                g = groups.setdefault(root, {"root": root, "count": 0, "modules": {}, "sample": []})
                g["count"] += 1
                g["modules"][name] = g["modules"].get(name, 0) + 1
                if len(g["sample"]) < 5:
                    g["sample"].append({**entry, "module": name})
            modules[name] = {
                "with_path": len(rows),
                "broken": len(broken),
                "sample": broken[:10],
            }

    return {
        "modules": modules,
        "groups": sorted(groups.values(), key=lambda g: -g["count"]),
        "total_broken": sum(m["broken"] for m in modules.values()),
        "total_with_path": sum(m["with_path"] for m in modules.values()),
    }
