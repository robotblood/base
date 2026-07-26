"""SQLModel table definitions for the core modules.

Every table carries a few common columns:
  - id:         local primary key
  - notion_id:  the source Notion page id (when known) so re-imports upsert
  - source:     which Notion database / file a row came from
  - tags:       Postgres text[] of free-form tags
  - raw:        JSONB snapshot of the original Notion row, so nothing is lost
  - created_at / updated_at
"""

from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import ARRAY, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(SQLModel):
    id: Optional[int] = Field(default=None, primary_key=True)
    notion_id: Optional[str] = Field(default=None, index=True)
    source: Optional[str] = Field(default=None, index=True)
    tags: list[str] = Field(default_factory=list, sa_type=ARRAY(String))
    raw: dict = Field(default_factory=dict, sa_type=JSONB)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Todo(Base, table=True):
    __tablename__ = "todos"
    title: str = Field(index=True)
    status: Optional[str] = Field(default="To Do", index=True)
    priority: Optional[str] = None
    assignee: Optional[str] = None
    due: Optional[date] = Field(default=None, index=True)
    notes: Optional[str] = None
    # Link to a projects.id (loose reference, no FK constraint — personal system).
    project_id: Optional[int] = Field(default=None, index=True)


class Note(Base, table=True):
    __tablename__ = "notes"
    title: str = Field(index=True)
    kind: str = Field(default="note", index=True)  # note | meeting | journal
    body: Optional[str] = None  # markdown page content
    # Link to a projects.id (loose reference, same convention as todos).
    project_id: Optional[int] = Field(default=None, index=True)
    status: Optional[str] = None
    meeting_type: Optional[str] = None
    attendees: list[str] = Field(default_factory=list, sa_type=ARRAY(String))
    meeting_time: Optional[datetime] = Field(default=None, index=True)


class Event(Base, table=True):
    __tablename__ = "events"
    title: str = Field(index=True)
    starts_at: Optional[datetime] = Field(default=None, index=True)
    ends_at: Optional[datetime] = None
    all_day: bool = False
    location: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    # Link to a people.id (loose reference, same convention as project_id).
    contact_id: Optional[int] = Field(default=None, index=True)
    kind: Optional[str] = Field(default="event", index=True)  # event | performance | deadline
    # Live-show pipeline: Confirmed | Advancing | Announced | Cancelled | Completed
    status: Optional[str] = Field(default=None, index=True)
    # Show production doc (performances only) — advance, times, counts, run of
    # day, crew, tickets, guests, settlement. Read/written whole, like the
    # projects JSONB fields.
    show: Optional[dict] = Field(default=None, sa_type=JSONB)
    notes: Optional[str] = None
    # Link to a projects.id (loose reference, same convention as todos/notes).
    project_id: Optional[int] = Field(default=None, index=True)


class Hardware(Base, table=True):
    __tablename__ = "hardware"
    name: str = Field(index=True)
    category: Optional[str] = Field(default=None, index=True)
    company: Optional[str] = None
    model: Optional[str] = None
    cpu: Optional[str] = None
    quantity: Optional[int] = 1
    power_w: Optional[float] = None
    price: Optional[float] = None
    purchase_date: Optional[date] = None
    photo_url: Optional[str] = None  # product image (remote URL renders inline)
    product_url: Optional[str] = None  # manufacturer product page
    support_url: Optional[str] = None  # direct support/manual page
    path: Optional[str] = None  # manuals, photos, config backups — media previews


class Software(Base, table=True):
    __tablename__ = "software"
    name: str = Field(index=True)
    category: Optional[str] = Field(default=None, index=True)  # DAW | 3D | design | dev …
    version: Optional[str] = None
    license: Optional[str] = None  # subscription | perpetual | open source …
    url: Optional[str] = None
    support_url: Optional[str] = None  # direct support/docs page
    path: Optional[str] = None  # installers, licenses, project templates — media previews


class Merch(Base, table=True):
    __tablename__ = "merch"
    name: str = Field(index=True)
    category: Optional[str] = Field(default=None, index=True)  # T-shirt | Album | Vinyl …
    sku: Optional[str] = None
    price: Optional[float] = None
    cost: Optional[float] = None
    stock: Optional[int] = 0
    low_stock_at: Optional[int] = None  # flag when stock falls to/below this
    url: Optional[str] = None  # store/listing page
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    # Link to a projects.id (loose reference, same convention as todos/notes).
    project_id: Optional[int] = Field(default=None, index=True)
    path: Optional[str] = None  # artwork, print files — media previews


class Project(Base, table=True):
    __tablename__ = "projects"
    name: str = Field(index=True)
    status: Optional[str] = Field(default=None, index=True)
    description: Optional[str] = None
    # Tracker fields (the /projects experience). The document-shaped pieces
    # (phases, milestones, …) are JSONB: they're only ever read/written whole
    # with their project, so they don't earn their own tables.
    kind: Optional[str] = Field(default=None, index=True)  # video | live show | music | ...
    year: Optional[str] = None
    health: Optional[str] = None  # on-track | at-risk | blocked
    start: Optional[date] = None
    due: Optional[date] = Field(default=None, index=True)
    path: Optional[str] = None  # on-disk folder root, drives media previews
    # Umbrella linking: a song project points at its album (loose reference,
    # same convention as todos.project_id). One level is enough.
    parent_id: Optional[int] = Field(default=None, index=True)
    phases: list = Field(default_factory=list, sa_type=JSONB)  # [{name, status}]
    milestones: list = Field(default_factory=list, sa_type=JSONB)  # [{name, date, done}]
    journal: list = Field(default_factory=list, sa_type=JSONB)  # [{date, title, body}]
    people: list = Field(default_factory=list, sa_type=JSONB)  # [{name, role}]
    linked: list = Field(default_factory=list, sa_type=JSONB)  # [{type, title, status}]
    activity: list = Field(default_factory=list, sa_type=JSONB)  # [{date, text}]
    rundown: Optional[dict] = Field(default=None, sa_type=JSONB)  # {sections: [...]}
    details: dict = Field(default_factory=dict, sa_type=JSONB)  # kind-specific: links, specs, ...


class Media(Base, table=True):
    __tablename__ = "media"
    title: str = Field(index=True)
    media_type: Optional[str] = Field(default=None, index=True)  # audio | visual | performance | track
    duration: Optional[str] = None
    url: Optional[str] = None


class Person(Base, table=True):
    __tablename__ = "people"
    name: str = Field(index=True)
    about: Optional[str] = None
    membership_type: Optional[str] = None
    path: Optional[str] = None  # on-disk folder (photos, shared work) for media previews


class Setting(SQLModel, table=True):
    """App configuration that belongs to the system rather than to a module.

    Deliberately not a `Base` subclass: settings have no Notion origin, no tags
    and no raw snapshot. Keeping them in Postgres rather than a JSON file on
    disk means `pg_dump` already backs them up — a theme you spent an evening
    on is restored by the same command that restores your notes.
    """

    __tablename__ = "settings"
    key: str = Field(primary_key=True)
    value: dict = Field(default_factory=dict, sa_type=JSONB)
    updated_at: datetime = Field(default_factory=utcnow)
