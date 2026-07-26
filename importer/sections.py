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
from importer.subpages import body_text, clean_name, derive_title

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
    # Give each top-level page its own child project, with the pages beneath it
    # attached there. For a section that is several separate efforts — a study
    # space holding four courses — one status for the lot says nothing useful.
    subjects: bool = False
    # Pages that are just the section's own index, not content.
    skip: tuple[str, ...] = ()
    # How much writing a page needs to be worth keeping. Sections default to
    # "anything at all": in a study space a page titled "Oxalates" holding one
    # line is a seed, not noise — the intent is the point. (The nested-note
    # importer uses a real floor because there it's filtering tool output.)
    min_body: int = 1


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
    SectionSpec(
        source="Continuing Education",
        path="Continuing Education",
        name="Continuing Education",
        kind="project",
        description=(
            "Ongoing study. Each subject is its own sub-project so progress is "
            "tracked per course rather than as one undifferentiated pile."
        ),
        status="In Progress",
        tags=("learning",),
        subjects=True,
        skip=("Teamspace Home",),
    ),
    SectionSpec(
        source="EIPA - Drafts",
        path="EIPA - Drafts",
        name="EIPA — Admin Backend v2",
        kind="rebuild",
        description=(
            "Version 2 database architecture for EIPA: the design meant to "
            "replace the FileMaker system. Data map, table definitions "
            "(EIPA_RATINGS, EIPA_SUBJECTS, EIPA_ROSTER), the relationships "
            "between them, and sample rating sessions."
        ),
        # A record of work done, not work in flight — archived on arrival so it
        # stays off the board and the home screen.
        status="Archive",
        tags=("EIPA", "design"),
    ),
]


def _content_dir(root: Path) -> Path:
    """Notion wraps a section's pages in one hex-named folder; the pages we
    want are inside it. Falls back to the section root if that changes."""
    subs = [p for p in root.iterdir() if p.is_dir()] if root.is_dir() else []
    if len(subs) == 1 and re.fullmatch(r"[0-9a-f]{32}", subs[0].name):
        return subs[0]
    return root


def _upsert_project(
    session: Session, source: str, name: str, **fields
) -> tuple[Project, str]:
    project = session.exec(
        select(Project).where(Project.source == source, Project.name == name)
    ).first()
    verb = "updated"
    if project is None:
        project = Project(name=name, source=source)
        verb = "created"
    for k, v in fields.items():
        # Status is only seeded, never reset — it's yours once the project exists.
        if k == "status" and project.status:
            continue
        setattr(project, k, v)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project, verb


def import_section(session: Session, export_root: Path, spec: SectionSpec) -> dict:
    stats = {"pages": 0, "created": 0, "updated": 0, "skipped": 0, "project": "", "subjects": 0}
    root = export_root / spec.path
    if not root.is_dir():
        print(f"  ! MISSING  {spec.source}: {root}")
        return stats
    content = _content_dir(root)

    project, stats["project"] = _upsert_project(
        session,
        spec.source,
        spec.name,
        kind=spec.kind,
        description=spec.description,
        status=spec.status,
        tags=list(spec.tags),
        # Real folder on disk: the FILES card previews the section's assets.
        path=str(content),
    )

    # With `subjects`, each top-level page becomes a child project and owns
    # everything filed beneath it; the folder name is what ties a page to its
    # subject, since that's how Notion nests them.
    subject_of: dict[str, Project] = {}
    if spec.subjects:
        for md in sorted(content.glob("*.md")):
            name = clean_name(md.stem)
            if name in spec.skip:
                continue
            # Notion names the child folder after the page but drops the page
            # id from it: "BTNRH eeae0bc0….md" holds its children in "BTNRH/".
            folder = content / name
            if not folder.is_dir():
                folder = content / md.stem
            if not folder.is_dir():
                continue
            child, _ = _upsert_project(
                session,
                spec.source,
                name,
                kind=spec.kind,
                parent_id=project.id,
                status=spec.status,
                tags=list(spec.tags),
                path=str(folder),
            )
            subject_of[name] = child
            subject_of[md.stem] = child
            stats["subjects"] += 1

    placed: list[tuple[Path, Note]] = []
    for md in sorted(content.rglob("*.md")):
        if clean_name(md.stem) in spec.skip:
            stats["skipped"] += 1
            continue
        try:
            text = md.read_text(encoding="utf-8")
        except OSError:
            continue
        if len(body_text(text)) < spec.min_body:
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
        # The first path segment under the section names the subject folder.
        rel = md.relative_to(content).parts
        owner = subject_of.get(rel[0]) if len(rel) > 1 else None
        # A top-level subject page belongs to its own project, not the parent.
        if owner is None and spec.subjects and len(rel) == 1:
            owner = subject_of.get(clean_name(md.stem))
        owner = owner or project

        fields = {
            "title": title,
            "body": link_assets(text, owner.id),
            "kind": "note",
            "notion_id": notion_id,
            "project_id": owner.id,
            "source": source,
            "raw": {"path": str(md.relative_to(export_root))},
            "tags": list(spec.tags),
        }
        if existing:
            for k, v in fields.items():
                setattr(existing, k, v)
            note = existing
            stats["updated"] += 1
        else:
            note = Note(**fields)
            stats["created"] += 1
        session.add(note)
        placed.append((md, note))
        stats["pages"] += 1

    session.commit()

    # Nest pages under the page they were filed inside. Notion puts a page's
    # children in a folder named after it, so the folder a page sits in names
    # its parent — that's how Potpourri's topics hang off Potpourri rather than
    # landing flat beside the lectures. Done in a second pass because a child
    # can be walked before its parent exists.
    owner_of_dir = {
        str((md.parent / clean_name(md.stem)).relative_to(content)): note
        for md, note in placed
    }
    for md, note in placed:
        key = str(md.parent.relative_to(content))
        parent = owner_of_dir.get(key)
        if parent is not None and parent.id != note.id:
            note.parent_id = parent.id
            session.add(note)
    session.commit()
    print(
        f"  ✓ {spec.source:24s} project {stats['project']:8s} "
        + (f"{stats['subjects']} subjects  " if stats["subjects"] else "")
        + f"pages +{stats['created']} ~{stats['updated']}"
        + (f" ({stats['skipped']} empty)" if stats["skipped"] else "")
    )
    return stats


def import_sections(session: Session, export_root: Path, only: set[str] | None = None) -> None:
    for spec in SECTIONS:
        if only and spec.source not in only:
            continue
        import_section(session, export_root, spec)
