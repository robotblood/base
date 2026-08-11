"""Extension fields: user-added columns on the built-in modules.

The custom-table builder lets a table's field list live in data; this brings
the same idea to the real tables. The registry is one Setting blob (key
"module_fields") mapping module name -> [FieldSpec]; the values land in each
row's `extras` JSONB column, which the CRUD routers flatten in and out. The
router is built from main.py's MODULES list because the models are the
authority on which names are real columns — an extension may never shadow one.

    GET /fields            the whole registry, {module: [specs]}
    PUT /fields/{module}   replace one module's extension list

Removing a field from either registry deletes only the spec — the values stay
behind in extras/data, invisible. The orphan endpoints make that deliberate
instead of accidental:

    GET  /fields/orphans          keys with real values but no field spec
    POST /fields/orphans/restore  re-add the field (type inferred) — values reappear
    POST /fields/orphans/purge    strip the values from every row — the true delete

Only keys holding at least one non-empty value count: a field removed with
nothing in it leaves zero residue and never appears here.
"""

import re

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlmodel import Session, select

from app import logs
from app.db import get_session
from app.models import CustomRow, CustomTable, Setting, utcnow

SETTING_KEY = "module_fields"
NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,39}$")
FIELD_TYPES = {
    "text",
    "textarea",
    "number",
    "date",
    "datetime",
    "select",
    "checkbox",
    "tags",
    "relation",
}

DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
DATETIME_RE = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}")


def _has_value(v) -> bool:
    """Empty means empty — None, "", [], {}. False and 0 are real values."""
    return v is not None and v != "" and v != [] and v != {}


def _infer_type(values: list) -> str:
    """Best-guess FieldSpec type from the surviving values, so a restored
    field renders like it used to. Anything ambiguous falls back to text —
    every type still displays as text, so a wrong guess loses nothing."""
    if all(isinstance(v, bool) for v in values):
        return "checkbox"
    if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in values):
        return "number"
    if all(isinstance(v, list) for v in values):
        return "tags"
    if all(isinstance(v, str) for v in values):
        if all(DATETIME_RE.match(v) for v in values):
            return "datetime"
        if all(DATE_RE.fullmatch(v) for v in values):
            return "date"
        if any(len(v) > 80 or "\n" in v for v in values):
            return "textarea"
    return "text"


def make_fields_router(modules: list) -> APIRouter:
    """`modules` is main.py's (model, name, title_field) list."""
    real_columns = {name: set(model.model_fields) for model, name, _ in modules}
    models_by_name = {name: model for model, name, _ in modules}
    router = APIRouter(prefix="/fields", tags=["fields"])

    def _registry(session: Session) -> dict:
        row = session.get(Setting, SETTING_KEY)
        return dict(row.value) if row else {}

    def _save_registry(session: Session, value: dict) -> None:
        row = session.get(Setting, SETTING_KEY)
        if row:
            row.value = value
            row.updated_at = utcnow()
        else:
            row = Setting(key=SETTING_KEY, value=value)
        session.add(row)

    @router.get("")
    def all_fields(session: Session = Depends(get_session)):
        return _registry(session)

    # ---- leftover values ---------------------------------------------------
    # Declared before /{module} routes ever exist so "orphans" can't be read
    # as a module name.

    def _scan(session: Session) -> list[dict]:
        """Every (module, key) holding real values without a field spec.
        Small system, whole-table scans are fine — this runs on demand from
        one admin page, not on a poll."""
        registry = _registry(session)
        found: list[dict] = []
        for model, name, _ in modules:
            specs = {f.get("name") for f in registry.get(name, [])}
            hits: dict[str, list] = {}
            for row in session.exec(select(model)).all():
                for k, v in (row.extras or {}).items():
                    if k not in specs and _has_value(v):
                        hits.setdefault(k, []).append(v)
            for k, values in sorted(hits.items()):
                found.append(
                    {
                        "module": name,
                        "kind": "builtin",
                        "key": k,
                        # A key that matches a real column is shadowed junk —
                        # the registry refuses the name, so it can only purge.
                        "restorable": k not in real_columns[name],
                        "rows": len(values),
                        "sample": str(values[0])[:80],
                    }
                )
        for table in session.exec(select(CustomTable)).all():
            specs = {f.get("name") for f in table.fields or []}
            hits = {}
            for row in session.exec(
                select(CustomRow).where(CustomRow.table_id == table.id)
            ).all():
                for k, v in (row.data or {}).items():
                    if k not in specs and _has_value(v):
                        hits.setdefault(k, []).append(v)
            for k, values in sorted(hits.items()):
                found.append(
                    {
                        "module": table.key,
                        "kind": "custom",
                        "key": k,
                        "restorable": True,
                        "rows": len(values),
                        "sample": str(values[0])[:80],
                    }
                )
        return found

    @router.get("/orphans")
    def orphans(session: Session = Depends(get_session)):
        return _scan(session)

    def _target(payload: dict) -> tuple[str, str]:
        module, key = str(payload.get("module") or ""), str(payload.get("key") or "")
        if not module or not key:
            raise HTTPException(422, "'module' and 'key' are required")
        return module, key

    def _orphan_values(session: Session, module: str, key: str) -> list:
        """The key's non-empty values across the module's rows."""
        if module in models_by_name:
            rows = session.exec(select(models_by_name[module])).all()
            raws = [(r.extras or {}).get(key) for r in rows]
        else:
            table = session.exec(select(CustomTable).where(CustomTable.key == module)).first()
            if not table:
                raise HTTPException(404, f"no module '{module}'")
            rows = session.exec(select(CustomRow).where(CustomRow.table_id == table.id)).all()
            raws = [(r.data or {}).get(key) for r in rows]
        return [v for v in raws if _has_value(v)]

    @router.post("/orphans/restore")
    def restore_orphan(payload: dict = Body(...), session: Session = Depends(get_session)):
        """Re-add the field spec; the waiting values become visible again."""
        module, key = _target(payload)
        values = _orphan_values(session, module, key)
        if not values:
            raise HTTPException(404, f"no leftover values for '{key}' on {module}")
        spec = {
            "name": key,
            "label": key.replace("_", " ").replace("-", " ").strip().title() or key,
            "type": _infer_type(values),
        }
        if module in models_by_name:
            if key in real_columns[module]:
                raise HTTPException(422, f"'{key}' shadows a real column on {module} — purge only")
            registry = _registry(session)
            specs = registry.get(module, [])
            if any(f.get("name") == key for f in specs):
                raise HTTPException(409, f"'{key}' is already a field on {module}")
            registry[module] = [*specs, spec]
            _save_registry(session, registry)
        else:
            table = session.exec(select(CustomTable).where(CustomTable.key == module)).first()
            if not table:
                raise HTTPException(404, f"no module '{module}'")
            if any(f.get("name") == key for f in table.fields or []):
                raise HTTPException(409, f"'{key}' is already a field on {module}")
            table.fields = [*(table.fields or []), spec]  # reassigned whole for JSONB
            table.updated_at = utcnow()
            session.add(table)
        session.commit()
        return spec

    @router.post("/orphans/purge")
    def purge_orphan(payload: dict = Body(...), session: Session = Depends(get_session)):
        """Strip the key from every row that carries it — the true delete."""
        module, key = _target(payload)
        purged = 0
        if module in models_by_name:
            rows = session.exec(select(models_by_name[module])).all()
            for r in rows:
                if key in (r.extras or {}):
                    extras = dict(r.extras)
                    extras.pop(key)
                    r.extras = extras  # reassigned whole for JSONB change detection
                    session.add(r)
                    purged += 1
        else:
            table = session.exec(select(CustomTable).where(CustomTable.key == module)).first()
            if not table:
                raise HTTPException(404, f"no module '{module}'")
            for r in session.exec(
                select(CustomRow).where(CustomRow.table_id == table.id)
            ).all():
                if key in (r.data or {}):
                    data = dict(r.data)
                    data.pop(key)
                    r.data = data
                    session.add(r)
                    purged += 1
        if not purged:
            raise HTTPException(404, f"no rows carry '{key}' on {module}")
        logs.log(
            "fields.purge_orphan",
            f"purged leftover field '{key}' from {purged} {module} rows — gone for good",
            session=session,
            detail={"module": module, "key": key, "rows": purged},
        )
        session.commit()
        return {"module": module, "key": key, "purged": purged}

    # ---- the registry itself ----------------------------------------------

    @router.put("/{module}")
    def put_fields(
        module: str, fields: list = Body(...), session: Session = Depends(get_session)
    ):
        if module not in real_columns:
            raise HTTPException(404, f"no module '{module}'")
        seen: set[str] = set()
        for f in fields:
            if not (isinstance(f, dict) and f.get("name") and f.get("label") and f.get("type")):
                raise HTTPException(422, "fields must be a list of {name, label, type}")
            if not NAME_RE.fullmatch(f["name"]):
                raise HTTPException(422, f"bad field name '{f['name']}'")
            if f["type"] not in FIELD_TYPES:
                raise HTTPException(422, f"bad field type '{f['type']}'")
            if f["name"] in real_columns[module]:
                raise HTTPException(422, f"'{f['name']}' is a real column on {module}")
            if f["name"] in seen:
                raise HTTPException(422, f"duplicate field '{f['name']}'")
            seen.add(f["name"])
        value = _registry(session)
        if fields:
            value[module] = fields
        else:
            value.pop(module, None)
        _save_registry(session, value)
        session.commit()
        return fields

    return router
