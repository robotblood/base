"""Generic CRUD router factory shared by every module.

Rather than hand-write eight near-identical routers, we generate one per
SQLModel table. Each gives:

    GET    /<name>            list (optional ?q= search on the title/name column)
    POST   /<name>            create
    GET    /<name>/{id}       read one
    PATCH  /<name>/{id}       partial update
    DELETE /<name>/{id}       delete
"""

from typing import Type

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.db import get_session
from app.models import utcnow

# Columns we never let a client set directly.
_PROTECTED = {"id", "created_at", "updated_at"}


def make_crud_router(
    model: Type, name: str, title_field: str, order_by: str | None = None, desc: bool = False
) -> APIRouter:
    router = APIRouter(prefix=f"/{name}", tags=[name])
    settable = {f for f in model.model_fields if f not in _PROTECTED}
    order_field = order_by or title_field

    def _apply(obj, payload: dict):
        for key, value in payload.items():
            if key in settable:
                setattr(obj, key, value)

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
        return session.exec(stmt).all()

    @router.post("", status_code=201)
    def create_item(payload: dict, session: Session = Depends(get_session)):
        if not payload.get(title_field):
            raise HTTPException(422, f"'{title_field}' is required")
        obj = model()
        _apply(obj, payload)
        session.add(obj)
        session.commit()
        session.refresh(obj)
        return obj

    @router.get("/{item_id}")
    def read_item(item_id: int, session: Session = Depends(get_session)):
        obj = session.get(model, item_id)
        if not obj:
            raise HTTPException(404, "not found")
        return obj

    @router.patch("/{item_id}")
    def update_item(item_id: int, payload: dict, session: Session = Depends(get_session)):
        obj = session.get(model, item_id)
        if not obj:
            raise HTTPException(404, "not found")
        _apply(obj, payload)
        obj.updated_at = utcnow()
        session.add(obj)
        session.commit()
        session.refresh(obj)
        return obj

    @router.delete("/{item_id}", status_code=204)
    def delete_item(item_id: int, session: Session = Depends(get_session)):
        obj = session.get(model, item_id)
        if not obj:
            raise HTTPException(404, "not found")
        session.delete(obj)
        session.commit()

    return router
