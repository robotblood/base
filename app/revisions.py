"""Checkpointing for record updates, and the endpoints to read them back.

The editor autosaves on a debounce, so hooking every PATCH would write a
revision per pause-in-typing. Instead a record gets at most one checkpoint per
CHECKPOINT_INTERVAL: frequent saves collapse into "the state as of ~10 minutes
ago", which is exactly what recovery needs. Old checkpoints prune past KEEP.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, SQLModel, select

from app.db import get_session
from app.models import Revision, utcnow


def _aware(dt: datetime) -> datetime:
    """Postgres TIMESTAMP columns hand values back naive; utcnow() is aware.
    Both are UTC, so pinning the zone makes them comparable."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

CHECKPOINT_INTERVAL = timedelta(minutes=10)
KEEP = 20


def checkpoint(session: Session, module: str, obj: SQLModel) -> None:
    """Snapshot `obj` under (module, id) unless a recent checkpoint exists.

    Call BEFORE applying an update, so the snapshot holds the state being
    overwritten. Adds to the caller's session; committed with the update.
    """
    record_id = getattr(obj, "id", None)
    if record_id is None:
        return
    last = session.exec(
        select(Revision)
        .where(Revision.module == module, Revision.record_id == record_id)
        .order_by(Revision.saved_at.desc())  # type: ignore[union-attr]
    ).first()
    if last and utcnow() - _aware(last.saved_at) < CHECKPOINT_INTERVAL:
        return
    session.add(Revision(module=module, record_id=record_id, snapshot=obj.model_dump(mode="json")))
    stale = session.exec(
        select(Revision)
        .where(Revision.module == module, Revision.record_id == record_id)
        .order_by(Revision.saved_at.desc())  # type: ignore[union-attr]
        .offset(KEEP - 1)
    ).all()
    for r in stale:
        session.delete(r)


router = APIRouter(prefix="/revisions", tags=["revisions"])


@router.get("")
def list_revisions(
    module: str = Query(...),
    record_id: int = Query(...),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        select(Revision)
        .where(Revision.module == module, Revision.record_id == record_id)
        .order_by(Revision.saved_at.desc())  # type: ignore[union-attr]
    ).all()
    # The list is for picking a point in time; snapshots come one at a time.
    return [{"id": r.id, "saved_at": r.saved_at} for r in rows]


@router.get("/{revision_id}")
def read_revision(revision_id: int, session: Session = Depends(get_session)):
    r = session.get(Revision, revision_id)
    if not r:
        raise HTTPException(404, "not found")
    return r
