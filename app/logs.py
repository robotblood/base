"""Writing to and reading from the system log.

The write path is deliberately forgiving: logging is never the point of the
operation that triggered it, so a failure here must not turn a working request
into a broken one. Every writer swallows its own errors and carries on.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlmodel import Session, delete, select

from app import models
from app.db import engine

LEVELS = ("debug", "info", "warn", "error")


def _utc(row: dict) -> dict:
    """Mark `at` as UTC on the way out.

    The column is a plain `timestamp` and we write `datetime.now(timezone.utc)`
    into it, so the value is correct but comes back naive — and a naive
    timestamp serialises without an offset, which JavaScript then reads as
    *local* time. That made a check run five hours ago render as "in 5h".
    Stamping the zone here fixes every consumer at once, and needs no migration.
    """
    at = row.get("at")
    if isinstance(at, datetime) and at.tzinfo is None:
        row["at"] = at.replace(tzinfo=timezone.utc)
    return row

# How long entries live, per level. Errors are worth keeping through a couple
# of monthly backup cycles; routine check results age out fast because there
# are ~96 of them a day and their value is in the recent trend, not the year.
RETENTION_DAYS = {"debug": 2, "info": 14, "warn": 60, "error": 180}


def log(
    event: str,
    message: str = "",
    *,
    level: str = "info",
    source: str = "api",
    detail: Optional[dict[str, Any]] = None,
    session: Optional[Session] = None,
) -> None:
    """Append one entry. Never raises.

    Pass `session` to join a transaction already in flight; otherwise this
    opens and commits its own so a log line can't be rolled back by whatever
    the caller does next.
    """
    row = models.SystemLog(
        level=level if level in LEVELS else "info",
        source=source,
        event=event,
        message=message[:2000],
        detail=detail or {},
    )
    try:
        if session is not None:
            session.add(row)
            return
        with Session(engine) as own:
            own.add(row)
            own.commit()
    except Exception:  # noqa: BLE001 — logging must not break the caller
        pass


def read(
    *,
    level: Optional[str] = None,
    source: Optional[str] = None,
    event: Optional[str] = None,
    q: Optional[str] = None,
    since_hours: Optional[int] = None,
    limit: int = 200,
) -> list[dict]:
    """Recent entries, newest first."""
    with Session(engine) as session:
        stmt = select(models.SystemLog)
        if q:
            # Message text only. The detail blob holds whole tracebacks, and
            # searching those turns every query into a scan of every stack
            # frame the system has ever produced.
            stmt = stmt.where(models.SystemLog.message.ilike(f"%{q}%"))
        if level:
            # A level filter means "this bad or worse" — asking for warnings
            # and being shown no errors would be actively misleading.
            wanted = LEVELS[LEVELS.index(level) :] if level in LEVELS else None
            if wanted:
                stmt = stmt.where(models.SystemLog.level.in_(wanted))
        if source:
            stmt = stmt.where(models.SystemLog.source == source)
        if event:
            stmt = stmt.where(models.SystemLog.event == event)
        if since_hours:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=since_hours)
            stmt = stmt.where(models.SystemLog.at >= cutoff)
        stmt = stmt.order_by(models.SystemLog.at.desc()).limit(min(limit, 1000))
        return [_utc(r.model_dump()) for r in session.exec(stmt).all()]


def latest_by_event(prefix: str) -> dict[str, dict]:
    """The most recent entry for each event starting with `prefix`.

    Powers "what changed since last time": the check runner compares this
    against the results it just produced to find newly-failing checks, so it
    can alert on a transition rather than nagging every fifteen minutes.
    """
    out: dict[str, dict] = {}
    with Session(engine) as session:
        rows = session.exec(
            select(models.SystemLog)
            .where(models.SystemLog.event.startswith(prefix))
            .order_by(models.SystemLog.at.desc())
            .limit(2000)
        ).all()
    for row in rows:
        if row.event not in out:
            out[row.event] = _utc(row.model_dump())
    return out


def check_history(hours: int = 48) -> dict[str, list[dict]]:
    """Per-check pass/fail series, oldest first.

    Turns the log into the thing a point-in-time health page can't show: not
    "the backup is stale" but "the backup has been stale since Thursday", and
    not "this passes" but "this has flapped six times today".
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    series: dict[str, list[dict]] = {}
    with Session(engine) as session:
        rows = session.exec(
            select(models.SystemLog)
            .where(
                models.SystemLog.event.startswith("check."),
                models.SystemLog.event != "check.run",
                models.SystemLog.at >= cutoff,
            )
            .order_by(models.SystemLog.at.asc())
        ).all()
    for row in rows:
        name = row.event.removeprefix("check.")
        series.setdefault(name, []).append(
            {
                "at": (row.at.replace(tzinfo=timezone.utc) if row.at.tzinfo is None else row.at),
                "status": row.detail.get("status", "ok"),
                "message": row.message,
            }
        )
    return series


def sources() -> list[str]:
    """Distinct sources present, so the filter offers only what exists."""
    with Session(engine) as session:
        return sorted({s for s in session.exec(select(models.SystemLog.source)).all() if s})


def summary(hours: int = 24) -> dict:
    """Counts by level over a window — the badge on the admin nav."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    counts = dict.fromkeys(LEVELS, 0)
    with Session(engine) as session:
        rows = session.exec(
            select(models.SystemLog.level).where(models.SystemLog.at >= cutoff)
        ).all()
    for level in rows:
        if level in counts:
            counts[level] += 1
    return {"hours": hours, "counts": counts, "problems": counts["warn"] + counts["error"]}


def prune() -> dict[str, int]:
    """Drop entries past their level's retention window."""
    removed: dict[str, int] = {}
    now = datetime.now(timezone.utc)
    with Session(engine) as session:
        for level, days in RETENTION_DAYS.items():
            cutoff = now - timedelta(days=days)
            result = session.exec(
                delete(models.SystemLog).where(
                    models.SystemLog.level == level, models.SystemLog.at < cutoff
                )
            )
            removed[level] = result.rowcount or 0
        session.commit()
    return removed
