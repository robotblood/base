"""Import the non-EIPA Notion databases into Postgres.

Usage:
    python -m importer.run_import            # import everything
    python -m importer.run_import --wipe      # truncate tables first
    python -m importer.run_import --only Tasks Hardware   # subset by source label

Rows are matched on (source, title). Re-running updates existing rows rather
than duplicating, so the import is idempotent.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from sqlalchemy import text
from sqlmodel import Session, select

from app.config import settings
from app.db import engine, init_db
from importer import notion as nd
from importer.mappings import SPECS, Spec

TITLE_FIELD = {  # which model attr holds the display title
    "todos": "title", "notes": "title", "events": "title", "media": "title",
    "hardware": "name", "software": "name", "projects": "name", "people": "name",
}


def _title_attr(model) -> str:
    return TITLE_FIELD[model.__tablename__]


def _resolve_title(row: dict, cols: list[str]) -> str | None:
    for c in cols:
        v = (row.get(c) or "").strip()
        if v:
            return v
    return None


def build_kwargs(spec: Spec, row: dict, bodies: dict[str, str]) -> dict | None:
    title = _resolve_title(row, spec.title_cols)
    if not title:
        return None
    kwargs: dict = dict(spec.defaults)
    kwargs[_title_attr(spec.model)] = title
    for target, extractor in spec.fields.items():
        kwargs[target] = extractor(row) if callable(extractor) else (row.get(extractor) or None)
    if spec.tags_from:
        kwargs["tags"] = nd.split_tags(row.get(spec.tags_from))
    if spec.load_bodies:
        body = bodies.get(nd.norm(title))
        if body:
            kwargs["body"] = body
    kwargs["source"] = spec.source
    kwargs["raw"] = {k: v for k, v in row.items() if v not in (None, "")}
    return kwargs


def import_spec(session: Session, root: Path, spec: Spec) -> tuple[int, int]:
    csv_path = root / spec.csv
    if not csv_path.exists():
        print(f"  ! MISSING  {spec.source}: {csv_path}")
        return (0, 0)
    rows = nd.read_csv(csv_path)
    bodies = nd.page_bodies(csv_path) if spec.load_bodies else {}
    title_attr = _title_attr(spec.model)
    created = updated = 0
    for row in rows:
        kwargs = build_kwargs(spec, row, bodies)
        if not kwargs:
            continue
        title = kwargs[title_attr]
        existing = session.exec(
            select(spec.model).where(
                spec.model.source == spec.source,
                getattr(spec.model, title_attr) == title,
            )
        ).first()
        if existing:
            for k, v in kwargs.items():
                setattr(existing, k, v)
            session.add(existing)
            updated += 1
        else:
            session.add(spec.model(**kwargs))
            created += 1
    session.commit()
    print(f"  ✓ {spec.source:24s} {spec.model.__tablename__:10s} +{created} ~{updated} ({len(rows)} rows)")
    return (created, updated)


def wipe(session: Session) -> None:
    tables = sorted({s.model.__tablename__ for s in SPECS})
    session.exec(text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY"))
    session.commit()
    print(f"  wiped: {', '.join(tables)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wipe", action="store_true", help="truncate target tables first")
    ap.add_argument("--only", nargs="*", help="only import these source labels")
    args = ap.parse_args()

    root = Path(settings.notion_export_dir)
    if not root.is_dir():
        raise SystemExit(f"NOTION_EXPORT_DIR not found: {root}")

    init_db()
    specs = SPECS if not args.only else [s for s in SPECS if s.source in set(args.only)]

    with Session(engine) as session:
        if args.wipe:
            wipe(session)
        total_c = total_u = 0
        for spec in specs:
            c, u = import_spec(session, root, spec)
            total_c += c
            total_u += u
        # Refresh the derived calendar from the (re)imported notes.
        from importer.derive import derive_events

        events = derive_events(session)
    print(f"\nDone. Created {total_c}, updated {total_u} across {len(specs)} databases.")
    print(f"Calendar: derived {events} events from notes.")


if __name__ == "__main__":
    main()
