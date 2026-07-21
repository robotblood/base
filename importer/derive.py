"""Derive calendar events from notes.

Many notes are dated: some carry an explicit `meeting_time`, and the daily
notes encode their date in the title (e.g. "@August 1, 2024" or
"@October 26, 2024 10:03 AM"). This turns those into rows in the events table
so the Calendar module shows a real timeline.

Idempotent: derived events use source "Notes (derived)" and match on
(source, title, starts_at) so re-running won't duplicate.
"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, delete, select

from app.db import engine, init_db
from app.models import Event, Note
from importer import notion as nd

DERIVED_SOURCE = "Notes (derived)"


def _note_datetime(note: Note) -> tuple[datetime | None, bool]:
    """Return (starts_at, all_day) for a note, or (None, False) if undatable."""
    if note.meeting_time:
        return note.meeting_time, False
    clean = (note.title or "").lstrip("@").strip()
    dt = nd.parse_datetime(clean)
    if not dt:
        return None, None  # type: ignore[return-value]
    all_day = dt.hour == 0 and dt.minute == 0
    return dt, all_day


def derive_events(session: Session) -> int:
    # Clear previously derived events so this stays a clean projection of notes.
    session.exec(delete(Event).where(Event.source == DERIVED_SOURCE))
    notes = session.exec(select(Note)).all()
    made = 0
    for note in notes:
        starts_at, all_day = _note_datetime(note)
        if not starts_at:
            continue
        title = (note.title or "").lstrip("@").strip()
        session.add(
            Event(
                title=title,
                starts_at=starts_at,
                all_day=bool(all_day),
                kind="meeting" if note.meeting_time else "daily-note",
                source=DERIVED_SOURCE,
                tags=note.tags,
                raw={"note_source": note.source, "note_id": note.id},
            )
        )
        made += 1
    session.commit()
    return made


def main() -> None:
    init_db()
    with Session(engine) as session:
        n = derive_events(session)
    print(f"Derived {n} calendar events from notes.")


if __name__ == "__main__":
    main()
