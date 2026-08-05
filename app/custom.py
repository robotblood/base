"""User-defined tables: the /tables schema registry and /x/{key} row CRUD.

The generic module routers are generated from SQLModel classes at import time;
custom tables can't be, because they're created at runtime. Instead every
custom table's rows live in one physical table (custom_rows, JSONB data) and
these endpoints present them in the same flat shape the module CRUD contract
uses — so the web's [module] machinery works on them unchanged:

    GET    /x/{key}            list (?q= searches the title)
    POST   /x/{key}            create
    GET    /x/{key}/{id}       read one
    PATCH  /x/{key}/{id}       partial update
    DELETE /x/{key}/{id}       delete

Rows flatten on the way out ({id, tags, created_at, ..., **data}) and
unflatten on the way in (unknown keys collect into data).
"""

import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.db import get_session
from app.models import CustomRow, CustomTable, utcnow
from app.revisions import checkpoint

KEY_RE = re.compile(r"^[a-z][a-z0-9-]{1,40}$")

# Every custom table gets a required Title text field; it's the search and
# ordering column, so the wizard pins it rather than letting it be removed.
TITLE = "title"

_BASE_KEYS = {"id", "created_at", "updated_at", "tags"}


def _flat(row: CustomRow) -> dict:
    return {
        "id": row.id,
        "tags": row.tags,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        **(row.data or {}),
    }


def _split(payload: dict, existing: dict | None = None) -> tuple[dict, list | None]:
    """Merge a request body into (data, tags): base columns stay columns,
    everything else lands in the JSONB blob."""
    data = dict(existing or {})
    tags = None
    for k, v in payload.items():
        if k == "tags":
            tags = v if isinstance(v, list) else []
        elif k not in _BASE_KEYS:
            data[k] = v
    return data, tags


def _get_table(session: Session, key: str) -> CustomTable:
    table = session.exec(select(CustomTable).where(CustomTable.key == key)).first()
    if not table:
        raise HTTPException(404, f"no custom table '{key}'")
    return table


def make_custom_routers(reserved: set[str]) -> tuple[APIRouter, APIRouter]:
    """Build the /tables and /x/{key} routers. `reserved` is the set of real
    module endpoint names a custom table key must not shadow."""
    taken = set(reserved) | {"tables", "x", "stats", "dashboard", "tags", "settings", "health", "logs"}

    tables = APIRouter(prefix="/tables", tags=["tables"])
    rows = APIRouter(prefix="/x", tags=["custom rows"])

    # ---- schema registry ----------------------------------------------------

    def _validate(payload: dict, session: Session, table_id: int | None = None) -> None:
        key = payload.get("key")
        if key is not None:
            if not isinstance(key, str) or not KEY_RE.fullmatch(key):
                raise HTTPException(422, "key must be a slug: lowercase letters, digits, dashes")
            if key in taken:
                raise HTTPException(422, f"'{key}' is a built-in name")
            dup = session.exec(select(CustomTable).where(CustomTable.key == key)).first()
            if dup and dup.id != table_id:
                raise HTTPException(422, f"a table with key '{key}' already exists")
        fields = payload.get("fields")
        if fields is not None:
            if not isinstance(fields, list) or not all(
                isinstance(f, dict) and f.get("name") and f.get("label") and f.get("type") for f in fields
            ):
                raise HTTPException(422, "fields must be a list of {name, label, type}")
            if not any(f["name"] == TITLE for f in fields):
                raise HTTPException(422, f"fields must include the '{TITLE}' field")

    def _count(session: Session, table_id: int) -> int:
        return len(session.exec(select(CustomRow.id).where(CustomRow.table_id == table_id)).all())

    def _out(t: CustomTable, session: Session) -> dict:
        return {**t.model_dump(), "row_count": _count(session, t.id)}

    @tables.get("")
    def list_tables(session: Session = Depends(get_session)):
        found = session.exec(select(CustomTable).order_by(CustomTable.name)).all()
        return [_out(t, session) for t in found]

    @tables.post("", status_code=201)
    def create_table(payload: dict, session: Session = Depends(get_session)):
        if not payload.get("name") or not payload.get("key"):
            raise HTTPException(422, "'name' and 'key' are required")
        _validate(payload, session)
        t = CustomTable(
            name=payload["name"],
            key=payload["key"],
            fields=payload.get("fields") or [],
        )
        if t.source_created_at is None:
            t.source_created_at = t.created_at
        session.add(t)
        session.commit()
        session.refresh(t)
        return _out(t, session)

    @tables.get("/{table_id}")
    def read_table(table_id: int, session: Session = Depends(get_session)):
        t = session.get(CustomTable, table_id)
        if not t:
            raise HTTPException(404, "not found")
        return _out(t, session)

    @tables.patch("/{table_id}")
    def update_table(table_id: int, payload: dict, session: Session = Depends(get_session)):
        t = session.get(CustomTable, table_id)
        if not t:
            raise HTTPException(404, "not found")
        _validate(payload, session, table_id)
        for field in ("name", "key", "fields"):
            if field in payload:
                setattr(t, field, payload[field])
        t.updated_at = utcnow()
        session.add(t)
        session.commit()
        session.refresh(t)
        return _out(t, session)

    @tables.delete("/{table_id}", status_code=204)
    def delete_table(table_id: int, session: Session = Depends(get_session)):
        t = session.get(CustomTable, table_id)
        if not t:
            raise HTTPException(404, "not found")
        # A table's rows have no life of their own — deleting the schema
        # deletes the records, like dropping a real table would.
        for r in session.exec(select(CustomRow).where(CustomRow.table_id == table_id)).all():
            session.delete(r)
        session.delete(t)
        session.commit()

    # ---- rows ----------------------------------------------------------------

    @rows.get("/{key}")
    def list_rows(
        key: str,
        session: Session = Depends(get_session),
        q: str | None = Query(default=None),
        limit: int = Query(default=500, le=2000),
        offset: int = 0,
    ):
        table = _get_table(session, key)
        stmt = select(CustomRow).where(CustomRow.table_id == table.id)
        if q:
            stmt = stmt.where(CustomRow.title.ilike(f"%{q}%"))
        stmt = stmt.order_by(CustomRow.title).offset(offset).limit(limit)
        return [_flat(r) for r in session.exec(stmt).all()]

    @rows.post("/{key}", status_code=201)
    def create_row(key: str, payload: dict, session: Session = Depends(get_session)):
        table = _get_table(session, key)
        data, tags = _split(payload)
        if not str(data.get(TITLE) or "").strip():
            raise HTTPException(422, f"'{TITLE}' is required")
        r = CustomRow(table_id=table.id, title=str(data[TITLE]), data=data, tags=tags or [])
        if r.source_created_at is None:
            r.source_created_at = r.created_at
        session.add(r)
        session.commit()
        session.refresh(r)
        return _flat(r)

    def _row(session: Session, key: str, row_id: int) -> CustomRow:
        table = _get_table(session, key)
        r = session.get(CustomRow, row_id)
        if not r or r.table_id != table.id:
            raise HTTPException(404, "not found")
        return r

    @rows.get("/{key}/{row_id}")
    def read_row(key: str, row_id: int, session: Session = Depends(get_session)):
        return _flat(_row(session, key, row_id))

    @rows.patch("/{key}/{row_id}")
    def update_row(key: str, row_id: int, payload: dict, session: Session = Depends(get_session)):
        r = _row(session, key, row_id)
        checkpoint(session, key, r)
        data, tags = _split(payload, r.data)
        r.data = data
        r.title = str(data.get(TITLE) or r.title)
        if tags is not None:
            r.tags = tags
        r.updated_at = utcnow()
        session.add(r)
        session.commit()
        session.refresh(r)
        return _flat(r)

    @rows.delete("/{key}/{row_id}", status_code=204)
    def delete_row(key: str, row_id: int, session: Session = Depends(get_session)):
        session.delete(_row(session, key, row_id))
        session.commit()

    return tables, rows
