#!/usr/bin/env python3
"""Backfill created_at from the Notion creation timestamp kept in `raw`.

Rows imported before importer/run_import.py learned to read Notion's creation
columns all carry the *import* timestamp instead, which collapses five years of
archive onto the afternoon of the import run. The original value is still in
the row's `raw` snapshot, so this recovers it without touching the export.

    ~/base/.venv/bin/python ~/base/scripts/backfill_created.py --dry-run
    ~/base/.venv/bin/python ~/base/scripts/backfill_created.py

Idempotent: re-running changes nothing once the values match. Rows whose
database never defined a creation property keep the import timestamp — the
export has no other record of when they were made.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select

from app import models
from app.db import engine
from importer import notion as nd
from importer.run_import import CREATED_COLS

# Every model that carries `raw`; only notes and todos actually have creation
# columns today, but a later import could bring one to any of them.
MODELS = [
    models.Todo, models.Note, models.Event, models.Project, models.Media,
    models.Person, models.Hardware, models.Software, models.Merch,
    models.JobApplication, models.Transaction, models.Budget, models.Learning,
    models.Incident, models.Collection,
]


def notion_created(raw: dict):
    for col in CREATED_COLS:
        parsed = nd.parse_datetime(raw.get(col))
        if parsed:
            return parsed
    return None


def local_rows(session: Session, dry_run: bool) -> int:
    """Rows made in base rather than imported: created_at is their real date.

    Nothing is being recovered or guessed here — a record with no Notion
    snapshot and no source label was created locally, so the timestamp already
    on it is the truth. Without this they would read as "creation unknown" and
    sort below the entire archive, which is the opposite of what they are.
    """
    changed = 0
    for model in MODELS:
        for row in session.exec(select(model)).all():
            if row.source_created_at is not None or row.source or row.raw:
                continue
            if not dry_run:
                row.source_created_at = row.created_at
                session.add(row)
            changed += 1
    if changed:
        print(f"  {'local records':14s} {changed}")
    return changed


def infer_from_parent(session: Session, dry_run: bool) -> int:
    """Approximate a nested note's created_at from the note it was written in.

    Distinct from the pass above, which recovers a real recorded timestamp:
    this one *infers*. Notion exports no creation time for a page nested inside
    another page, but a document written inside a given weekly note was written
    during that week, which beats the alternative — every such page keeping the
    import timestamp and so claiming to be newer than five years of real work.

    Only applied to rows that have no recorded time of their own, and only from
    a parent that does. Nothing overwrites a known value.
    """
    notes = session.exec(select(models.Note)).all()
    by_id = {n.id: n for n in notes}
    known = {n.id for n in notes if notion_created(n.raw or {})}

    changed = 0
    for note in notes:
        if note.id in known or note.parent_id is None:
            continue
        parent = by_id.get(note.parent_id)
        if not parent or parent.id not in known:
            continue
        if note.created_at == parent.created_at and note.source_created_at == parent.created_at:
            continue
        if not dry_run:
            note.created_at = parent.created_at
            # An inference, but a dated one: leaving this null would drop the
            # note to the bottom alongside the pages nothing is known about.
            note.source_created_at = parent.created_at
            session.add(note)
        changed += 1
    if changed:
        print(f"  {'notes (inherited)':14s} {changed}")
    return changed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="report without writing")
    ap.add_argument(
        "--infer-from-parent",
        action="store_true",
        help="also approximate nested notes' created_at from their parent note",
    )
    args = ap.parse_args()

    total = 0
    with Session(engine) as session:
        for model in MODELS:
            changed = 0
            for row in session.exec(select(model)).all():
                created = notion_created(row.raw or {})
                if not created:
                    continue
                if row.created_at == created and row.source_created_at == created:
                    continue
                if not args.dry_run:
                    row.created_at = created
                    row.source_created_at = created
                    session.add(row)
                changed += 1
            if changed:
                print(f"  {model.__tablename__:14s} {changed}")
            total += changed

        total += local_rows(session, args.dry_run)

        if args.infer_from_parent:
            total += infer_from_parent(session, args.dry_run)

        if args.dry_run:
            session.rollback()
        else:
            session.commit()

    verb = "would update" if args.dry_run else "updated"
    print(f"\n{verb} {total} rows.")


if __name__ == "__main__":
    main()
