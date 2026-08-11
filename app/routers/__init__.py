"""Generic CRUD router factory shared by every module.

Rather than hand-write eight near-identical routers, we generate one per
SQLModel table. Each gives:

    GET    /<name>            list (optional ?q= search on the title/name column)
    POST   /<name>            create
    GET    /<name>/{id}       read one
    PATCH  /<name>/{id}       partial update
    DELETE /<name>/{id}       delete
"""

from typing import Callable, Type

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.db import get_session
from app.models import utcnow
from app.revisions import checkpoint, checkpoint_delete

# Columns we never let a client set directly. `extras` is in here because
# clients see its contents flattened — a literal "extras" key would clobber
# every user-added value on the row at once.
_PROTECTED = {"id", "created_at", "updated_at", "extras"}


def _flat(row) -> dict:
    """One flat dict per row, user-added fields included — the same shape
    custom rows use, so the web never has to know which kind it is reading.
    Real columns win a name collision: the /fields registry refuses to create
    one, so a clash means stale data, not a live field."""
    d = dict(row) if isinstance(row, dict) else row.model_dump()
    extras = d.pop("extras", None) or {}
    return {**extras, **d}


def make_crud_router(
    model: Type,
    name: str,
    title_field: str,
    order_by: str | None = None,
    desc: bool = False,
    # Adds read-only fields to a row on the way out — values derived from other
    # rows rather than stored (see app/inherit.py). Takes the rows and a
    # session, returns one dict per row.
    decorate: Callable[[list, Session], list[dict]] | None = None,
    # Checkpoint the old state before updates (app/revisions.py). Enabled for
    # modules whose rows hold real work (notes bodies, project documents).
    revisions: bool = False,
) -> APIRouter:
    router = APIRouter(prefix=f"/{name}", tags=[name])
    settable = {f for f in model.model_fields if f not in _PROTECTED}
    order_field = order_by or title_field

    def _apply(obj, payload: dict):
        # Unknown keys are user-added fields — collect them into the extras
        # blob (reassigned whole so SQLAlchemy sees the JSONB change).
        extras = dict(obj.extras or {})
        extras_changed = False
        for key, value in payload.items():
            if key in settable:
                setattr(obj, key, value)
            elif key not in _PROTECTED:
                extras[key] = value
                extras_changed = True
        if extras_changed:
            obj.extras = extras

    @router.get("")
    def list_items(
        session: Session = Depends(get_session),
        q: str | None = Query(default=None, description="case-insensitive search"),
        limit: int = Query(default=500, le=2000),
        offset: int = 0,
    ):
        stmt = select(model)
        if q:
            col = getattr(model, title_field)
            stmt = stmt.where(col.ilike(f"%{q}%"))
        order_col = getattr(model, order_field)
        stmt = stmt.order_by(order_col.desc() if desc else order_col)
        stmt = stmt.offset(offset).limit(limit)
        rows = session.exec(stmt).all()
        out = decorate(list(rows), session) if decorate else rows
        return [_flat(r) for r in out]

    @router.post("", status_code=201)
    def create_item(payload: dict, session: Session = Depends(get_session)):
        if not payload.get(title_field):
            raise HTTPException(422, f"'{title_field}' is required")
        obj = model()
        _apply(obj, payload)
        # A record made here has a known creation time: now. Only the importers
        # leave source_created_at null, and only where the export genuinely
        # recorded none — see Base.source_created_at. Without this every record
        # created in base would read as "creation date unknown" and sort last.
        if obj.source_created_at is None:
            obj.source_created_at = obj.created_at
        session.add(obj)
        session.commit()
        session.refresh(obj)
        return _flat(obj)

    @router.get("/{item_id}")
    def read_item(item_id: int, session: Session = Depends(get_session)):
        obj = session.get(model, item_id)
        if not obj:
            raise HTTPException(404, "not found")
        return _flat(decorate([obj], session)[0] if decorate else obj)

    @router.patch("/{item_id}")
    def update_item(item_id: int, payload: dict, session: Session = Depends(get_session)):
        obj = session.get(model, item_id)
        if not obj:
            raise HTTPException(404, "not found")
        if revisions:
            checkpoint(session, name, obj)
        _apply(obj, payload)
        obj.updated_at = utcnow()
        session.add(obj)
        session.commit()
        session.refresh(obj)
        return _flat(obj)

    @router.delete("/{item_id}", status_code=204)
    def delete_item(item_id: int, session: Session = Depends(get_session)):
        obj = session.get(model, item_id)
        if not obj:
            raise HTTPException(404, "not found")
        # Every module, not just the REVISIONED ones: updates are only worth
        # checkpointing where a lost draft hurts, but a delete loses the whole
        # record — the trash (app/trash.py) is the undo for that.
        checkpoint_delete(session, name, obj)
        session.delete(obj)
        session.commit()

    return router
