"""Import the documents nested inside Notes & Meetings pages.

A weekly note is a workspace. Anything that became a deliverable got its own
page *inside* that note — system designs, specs, transition plans, transcripts.
The CSV import only ever sees database rows and each row's own page body, so
those nested pages never arrived.

This walks the page tree and brings each one in as a child note
(`notes.parent_id` -> the note it was written under).

Two kinds of page are deliberately skipped:

  * machine-generated schema dumps — 1,595 pages of FileMaker introspection,
    one per database field ("__kptID", "modAccount"), written by a tool rather
    than by hand;
  * stubs — pages whose only content is Notion's own metadata header, which is
    what most of a nested task-log database looks like.

Idempotent: children are keyed by the Notion page id in their filename, so
re-running updates rather than duplicating — and siblings that share a title
stay distinct records.
"""

from __future__ import annotations

import re
from pathlib import Path

from sqlmodel import Session, select

from app.models import Note
from importer import notion as nd

# Nested databases that hold tool output rather than writing.
SCHEMA_DUMPS = {"fields", "scripts", "tables", "filemaker_fields_export"}

SOURCE = "Notes and Meetings (page)"

_HASH = re.compile(r"\s+[0-9a-f]{32}$")
# The same id, captured rather than stripped.
_HASH_ONLY = re.compile(r"\s+([0-9a-f]{32})$")
# Notion writes "Key: value" lines under the title for a page's properties.
_META = re.compile(r"^[A-Z][A-Za-z /()-]{0,40}:\s")


def clean_name(stem: str) -> str:
    return _HASH.sub("", stem).strip()


def body_text(md: str) -> str:
    """The page's actual writing — title line and property block removed."""
    lines = md.splitlines()
    out = []
    for line in lines:
        s = line.strip()
        if not s or s.startswith("# ") and not out:
            continue
        if _META.match(s) and not out:
            continue
        out.append(s)
    return "\n".join(out).strip()


def is_stub(md: str, floor: int = 80) -> bool:
    """A page carrying nothing but its own metadata isn't a document.

    Judged on content alone. An untitled page is not the same thing as an empty
    one — the export has untitled pages holding tens of thousands of characters,
    and dropping those for want of a filename would lose real work.
    """
    return len(body_text(md)) < floor


def derive_title(md: str, fallback: str) -> str:
    """A name for a page Notion never titled.

    The first real heading or line of prose. Skips the page's own "Untitled"
    heading, its property block, and anything that looks like pasted tabular
    data — a row of tab-separated values makes a worse name than the fallback.
    """
    for line in md.splitlines():
        s = line.strip().lstrip("#").strip()
        if not s or _META.match(s) or s.lower() == "untitled":
            continue
        if "\t" in line or s.count("|") > 2:
            continue
        s = re.sub(r"\s+", " ", s)
        return (s[:70].rstrip() + "…") if len(s) > 70 else s
    return fallback


def import_subpages(session: Session, csv_path: Path, parent_source: str) -> dict:
    """Walk the page folder beside `csv_path` and import nested documents."""
    base = re.sub(r"\s+[0-9a-f]{32}_all\.csv$", "", csv_path.name)
    root = csv_path.parent / base
    stats = {"created": 0, "updated": 0, "stubs": 0, "schema": 0, "orphans": 0, "retitled": 0}
    if not root.is_dir():
        return stats

    # Parent notes by normalised title, so a page folder can find its row.
    parents = {
        nd.norm(n.title): n
        for n in session.exec(select(Note).where(Note.source == parent_source)).all()
    }

    for md in sorted(root.rglob("*.md")):
        rel = md.relative_to(root).parts
        if len(rel) < 2:
            continue  # the note's own page — already imported as its body
        if any(clean_name(part).lower() in SCHEMA_DUMPS for part in rel[1:-1]):
            stats["schema"] += 1
            continue
        parent = parents.get(nd.norm(clean_name(rel[0])))
        if parent is None:
            stats["orphans"] += 1
            continue
        try:
            text = md.read_text(encoding="utf-8")
        except OSError:
            continue
        if is_stub(text):
            stats["stubs"] += 1
            continue

        title = clean_name(md.stem)
        if not title or title.lower() == "untitled":
            title = derive_title(text, f"Untitled — under {parent.title}")
            stats["retitled"] += 1

        # The hex suffix Notion appends to every filename is the page id — a
        # stable identity per page. Matching on (parent, title) instead would
        # collapse siblings that share a name: a nested database under one week
        # exports pages called X1…X6 four times over, and each overwrote the
        # last.
        page_id = _HASH_ONLY.search(md.stem)
        notion_id = page_id.group(1) if page_id else None

        existing = (
            session.exec(
                select(Note).where(Note.source == SOURCE, Note.notion_id == notion_id)
            ).first()
            if notion_id
            else None
        )
        fields = {
            "title": title,
            "body": text,
            "kind": "note",
            "notion_id": notion_id,
            "parent_id": parent.id,
            "project_id": parent.project_id,
            # Deliberately no meeting_time: a document written during a week
            # isn't an appointment, and inheriting the parent's time put every
            # one of these on the calendar.
            "source": SOURCE,
            # The page's own path, so a row can be traced back to the export.
            "raw": {"path": str(md.relative_to(root.parent)), "parent": parent.title},
            "tags": list(parent.tags or []),
        }
        if existing:
            for k, v in fields.items():
                setattr(existing, k, v)
            session.add(existing)
            stats["updated"] += 1
        else:
            session.add(Note(**fields))
            stats["created"] += 1

    session.commit()
    return stats
