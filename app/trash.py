"""The row trash: deleted records, restorable for a while, then swept.

Deleting a record (any module, any custom table) moves its final state and its
update history into the revisions table under a `deleted` flag — see
checkpoint_delete in app/revisions.py. This router is the other half: list
what's in the trash, put a record back, purge one, empty the lot.

The trash empties itself: entries older than TRASH_TTL are swept on every
list and at API startup, so a fat-fingered delete has a real undo window
without the trash becoming a junk drawer to manage.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import CustomRow, CustomTable, Revision, utcnow

TRASH_TTL = timedelta(days=90)


def sweep(session: Session) -> int:
    """Drop trash entries past TRASH_TTL. Returns how many went."""
    cutoff = utcnow() - TRASH_TTL
    stale = session.exec(
        select(Revision).where(
            Revision.deleted.is_(True),  # type: ignore[union-attr]
            Revision.saved_at < cutoff,
        )
    ).all()
    for r in stale:
        session.delete(r)
    if stale:
        session.commit()
    return len(stale)


def make_trash_router(modules: list) -> APIRouter:
    """`modules` is main.py's (model, name, title_field) list. Any module name
    not in it is a custom-table key, whose rows live in custom_rows."""
    builtin = {name: (model, title_field) for model, name, title_field in modules}
    router = APIRouter(prefix="/trash", tags=["trash"])

    def _title(module: str, snapshot: dict) -> str:
        _, title_field = builtin.get(module, (None, "title"))
        return str(snapshot.get(title_field) or snapshot.get("title") or "untitled")

    def _record_entries(session: Session, module: str, record_id: int) -> list[Revision]:
        return session.exec(
            select(Revision).where(
                Revision.module == module,
                Revision.record_id == record_id,
                Revision.deleted.is_(True),  # type: ignore[union-attr]
            )
        ).all()

    @router.get("")
    def list_trash(session: Session = Depends(get_session)):
        """One entry per deleted record: its final state plus how much history
        came along. Sweeps first, so the list is also the retention clock."""
        sweep(session)
        rows = session.exec(
            select(Revision)
            .where(Revision.deleted.is_(True))  # type: ignore[union-attr]
            .order_by(Revision.saved_at.desc())  # type: ignore[union-attr]
        ).all()
        out: dict[tuple[str, int], dict] = {}
        for r in rows:  # newest first, so first sight of a record is its final state
            k = (r.module, r.record_id)
            if k in out:
                out[k]["history"] += 1
            else:
                out[k] = {
                    "revision_id": r.id,
                    "module": r.module,
                    "record_id": r.record_id,
                    "title": _title(r.module, r.snapshot),
                    "deleted_at": r.saved_at,
                    "history": 0,
                }
        return list(out.values())

    @router.post("/{revision_id}/restore")
    def restore(revision_id: int, session: Session = Depends(get_session)):
        """Re-insert the record from its final snapshot and bring its update
        history back out of the trash."""
        rev = session.get(Revision, revision_id)
        if not rev or not rev.deleted:
            raise HTTPException(404, "not in the trash")
        snapshot = dict(rev.snapshot)
        if rev.module in builtin:
            model, _ = builtin[rev.module]
            obj = model.model_validate(snapshot)
        else:
            table = session.exec(
                select(CustomTable).where(CustomTable.key == rev.module)
            ).first()
            if not table:
                raise HTTPException(
                    409, f"table '{rev.module}' no longer exists — restore it first (admin → archive)"
                )
            obj = CustomRow.model_validate(snapshot)
            obj.table_id = table.id
        # Ids come from sequences and are never re-issued, so the original id
        # is normally free — keeping it heals loose references (project_id and
        # friends). If something does hold it, insert as a new record instead.
        if obj.id is not None and session.get(type(obj), obj.id):
            obj.id = None
        for r in _record_entries(session, rev.module, rev.record_id):
            r.deleted = False  # the final snapshot stays behind as ordinary history
            session.add(r)
        session.add(obj)
        session.commit()
        session.refresh(obj)
        return {"module": rev.module, "id": obj.id}

    @router.delete("/{revision_id}", status_code=204)
    def purge(revision_id: int, session: Session = Depends(get_session)):
        """Really delete one record: its final snapshot and its history."""
        rev = session.get(Revision, revision_id)
        if not rev or not rev.deleted:
            raise HTTPException(404, "not in the trash")
        for r in _record_entries(session, rev.module, rev.record_id):
            session.delete(r)
        session.commit()

    @router.delete("", status_code=204)
    def empty(session: Session = Depends(get_session)):
        for r in session.exec(
            select(Revision).where(Revision.deleted.is_(True))  # type: ignore[union-attr]
        ).all():
            session.delete(r)
        session.commit()

    return router
