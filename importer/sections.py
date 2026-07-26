"""Import a Notion *section* — a tree of pages with no database behind it — as
a project whose pages become its linked notes.

Some workspace sections are just documents: a site's Home / About / Services
pages, a captured competitor site. There's no CSV to map because there's no
database, so `mappings.py` can't reach them. Each becomes one project, with
every page attached through `notes.project_id` — the same rollup the rest of
the app already uses.

The project's `path` points at the exported page folder, so its assets (a
site's images, for instance) show up in the FILES card without copying
anything.

Idempotent: the project matches on (source, name) and each page on its Notion
page id, so re-running updates in place.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from sqlmodel import Session, select

from app.models import Note, Project
from importer.subpages import body_text, clean_name, derive_title, is_stub

_HASH_ONLY = re.compile(r"\s+([0-9a-f]{32})$")

# Markdown image references. Notion writes them relative to the page file, and
# percent-encoded: ![alt](Home%20Page/photo.jpg)
_IMG = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")


def link_assets(md: str, project_id: int) -> str:
    """Point a page's own images at the file endpoint.

    The export stores each page's assets in a folder beside it, and the
    markdown refers to them by relative path. Rendered in the app those
    resolve against the site root and 404, so they're rewritten to the
    project's file endpoint — which reads from the same folder the project's
    `path` already points at. External URLs are left alone.
    """

    def swap(m: re.Match) -> str:
        alt, target = m.group(1), m.group(2).strip()
        if target.startswith(("http://", "https://", "data:", "/")):
            return m.group(0)
        return f"![{alt}](/projects/{project_id}/file?p={target})"

    return _IMG.sub(swap, md)


@dataclass
class SectionSpec:
    source: str  # label stored in `source`, and the --only key
    path: str  # section folder, relative to the export root
    name: str  # project name
    kind: str
    description: str = ""
    status: str = "Not Started"
    tags: tuple[str, ...] = ()


SECTIONS: list[SectionSpec] = [
    SectionSpec(
        source="Integrity Mindset Group",
        path="Integrity Mindset Group",
        name="Integrity Mindset Group",
        kind="app dev",
        description=(
            "Lead-generation site for Costco home improvement products — "
            "Home, About, Services, Team, Careers, News, Contact."
        ),
        tags=("website", "client"),
    ),
    SectionSpec(
        source="Pet Pantry",
        path="Pet Pantry",
        name="Pet Pantry",
        kind="app dev",
        description=(
            "petpantrystore.com (Rapid City, SD), captured from the Wayback "
            "Machine — storefront pages plus the site's WordPress JavaScript."
        ),
        tags=("website", "reference"),
    ),
]


def _content_dir(root: Path) -> Path:
    """Notion wraps a section's pages in one hex-named folder; the pages we
    want are inside it. Falls back to the section root if that changes."""
    subs = [p for p in root.iterdir() if p.is_dir()] if root.is_dir() else []
    if len(subs) == 1 and re.fullmatch(r"[0-9a-f]{32}", subs[0].name):
        return subs[0]
    return root


def import_section(session: Session, export_root: Path, spec: SectionSpec) -> dict:
    stats = {"pages": 0, "created": 0, "updated": 0, "skipped": 0, "project": ""}
    root = export_root / spec.path
    if not root.is_dir():
        print(f"  ! MISSING  {spec.source}: {root}")
        return stats
    content = _content_dir(root)

    project = session.exec(
        select(Project).where(Project.source == spec.source, Project.name == spec.name)
    ).first()
    if project is None:
        project = Project(name=spec.name, source=spec.source)
        stats["project"] = "created"
    else:
        stats["project"] = "updated"
    project.kind = spec.kind
    project.description = spec.description
    project.status = project.status or spec.status
    project.tags = list(spec.tags)
    # Real folder on disk: the FILES card previews the section's assets.
    project.path = str(content)
    session.add(project)
    session.commit()
    session.refresh(project)

    for md in sorted(content.rglob("*.md")):
        try:
            text = md.read_text(encoding="utf-8")
        except OSError:
            continue
        if is_stub(text):
            stats["skipped"] += 1
            continue
        title = clean_name(md.stem) or derive_title(text, md.stem)
        hit = _HASH_ONLY.search(md.stem)
        notion_id = hit.group(1) if hit else None
        source = f"{spec.source} (page)"

        existing = (
            session.exec(
                select(Note).where(Note.source == source, Note.notion_id == notion_id)
            ).first()
            if notion_id
            else None
        )
        fields = {
            "title": title,
            "body": link_assets(text, project.id),
            "kind": "note",
            "notion_id": notion_id,
            "project_id": project.id,
            "source": source,
            "raw": {"path": str(md.relative_to(export_root))},
            "tags": list(spec.tags),
        }
        if existing:
            for k, v in fields.items():
                setattr(existing, k, v)
            session.add(existing)
            stats["updated"] += 1
        else:
            session.add(Note(**fields))
            stats["created"] += 1
        stats["pages"] += 1

    session.commit()
    print(
        f"  ✓ {spec.source:24s} project {stats['project']:8s} "
        f"pages +{stats['created']} ~{stats['updated']}"
        + (f" ({stats['skipped']} empty)" if stats["skipped"] else "")
    )
    return stats


def import_sections(session: Session, export_root: Path, only: set[str] | None = None) -> None:
    for spec in SECTIONS:
        if only and spec.source not in only:
            continue
        import_section(session, export_root, spec)
