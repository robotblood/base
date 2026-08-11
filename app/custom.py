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

from app import logs
from app.db import get_session
from app.models import Archive, CustomRow, CustomTable, Revision, utcnow
from app.revisions import checkpoint, checkpoint_delete

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
    taken = set(reserved) | {"tables", "x", "fields", "stats", "dashboard", "tags", "settings", "health", "logs", "trash", "archives"}

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
        # deletes the records, like dropping a real table would. But a table
        # with data serializes into the archive first (restorable under
        # admin → archive); only an empty table just vanishes, because there
        # is nothing to lose and archiving it would only pile up junk.
        found = session.exec(select(CustomRow).where(CustomRow.table_id == table_id)).all()
        if found:
            session.add(
                Archive(
                    name=t.name,
                    key=t.key,
                    row_count=len(found),
                    payload={
                        "table": t.model_dump(mode="json"),
                        "rows": [r.model_dump(mode="json") for r in found],
                    },
                )
            )
        for r in found:
            session.delete(r)
        session.delete(t)
        if found:
            logs.log(
                "archive.table",
                f"archived table '{t.name}' ({len(found)} rows)",
                session=session,
                detail={"key": t.key, "rows": len(found)},
            )
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
        r = _row(session, key, row_id)
        checkpoint_delete(session, key, r)
        session.delete(r)
        session.commit()

    return tables, rows, make_archives_router()


def make_archives_router() -> APIRouter:
    """Archived tables: list what's in the graveyard, rebuild one, purge one.

        GET    /archives               list (no payloads — they can be large)
        POST   /archives/{id}/restore  recreate the table and its rows
        DELETE /archives/{id}          purge — the only true delete
    """
    archives = APIRouter(prefix="/archives", tags=["archives"])

    @archives.get("")
    def list_archives(session: Session = Depends(get_session)):
        found = session.exec(
            select(Archive).order_by(Archive.archived_at.desc())  # type: ignore[union-attr]
        ).all()
        return [
            {
                "id": a.id,
                "name": a.name,
                "key": a.key,
                "row_count": a.row_count,
                "archived_at": a.archived_at,
            }
            for a in found
        ]

    @archives.post("/{archive_id}/restore")
    def restore_archive(archive_id: int, session: Session = Depends(get_session)):
        a = session.get(Archive, archive_id)
        if not a:
            raise HTTPException(404, "not found")
        t = CustomTable.model_validate(a.payload.get("table") or {})
        # The key may have been retaken by a table built since; suffix rather
        # than refuse — the restored data matters more than the exact slug.
        base_key = t.key
        for i in range(2, 100):
            if not session.exec(select(CustomTable).where(CustomTable.key == t.key)).first():
                break
            t.key = f"{base_key}-{i}"
        # Sequence-issued ids are never re-issued, so the original ids are
        # normally free. Keeping them reconnects row revision history and any
        # loose references; on the off chance one is taken, take a fresh id.
        if t.id is not None and session.get(CustomTable, t.id):
            t.id = None
        session.add(t)
        session.flush()  # need t.id for the rows
        restored = 0
        for rowdict in a.payload.get("rows") or []:
            r = CustomRow.model_validate(rowdict)
            if r.id is not None and session.get(CustomRow, r.id):
                r.id = None
            r.table_id = t.id
            session.add(r)
            restored += 1
        # If the slug had to change, the rows' revision trail — update
        # checkpoints and trashed siblings alike — still points at the old
        # key. Re-key everything whose snapshot belongs to this table (the
        # snapshot's table_id says so; a table now squatting the old key
        # writes different row ids and table_ids, so there's no collision).
        if t.key != base_key:
            for rev in session.exec(select(Revision).where(Revision.module == base_key)).all():
                if (rev.snapshot or {}).get("table_id") == t.id:
                    rev.module = t.key
                    session.add(rev)
        session.delete(a)
        logs.log(
            "archive.restore",
            f"restored table '{t.name}' ({restored} rows)",
            session=session,
            detail={"key": t.key, "rows": restored},
        )
        session.commit()
        session.refresh(t)
        return {**t.model_dump(), "row_count": restored}

    @archives.delete("/{archive_id}", status_code=204)
    def purge_archive(archive_id: int, session: Session = Depends(get_session)):
        a = session.get(Archive, archive_id)
        if not a:
            raise HTTPException(404, "not found")
        # Take the rows' leftover update checkpoints with it — with the
        # archive gone they could never reconnect to anything.
        row_ids = [r.get("id") for r in (a.payload.get("rows") or []) if r.get("id") is not None]
        if row_ids:
            for rev in session.exec(
                select(Revision).where(Revision.module == a.key, Revision.record_id.in_(row_ids))  # type: ignore[attr-defined]
            ).all():
                session.delete(rev)
        session.delete(a)
        logs.log(
            "archive.purge",
            f"purged archived table '{a.name}' ({a.row_count} rows) — gone for good",
            session=session,
            detail={"key": a.key, "rows": a.row_count},
        )
        session.commit()

    return archives
