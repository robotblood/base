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


class JobApplication(Base, table=True):
    """A role applied for. `found_via` rather than `source` because the Base
    class already uses `source` for which Notion database a row came from."""

    __tablename__ = "applications"
    role: str = Field(index=True)
    company: Optional[str] = Field(default=None, index=True)
    status: Optional[str] = Field(default=None, index=True)
    priority: Optional[str] = None
    location: Optional[str] = None
    contact: Optional[str] = None
    applied: Optional[date] = Field(default=None, index=True)
    follow_up: Optional[date] = Field(default=None, index=True)
    posting_url: Optional[str] = None
    salary_range: Optional[str] = None
    resume_version: Optional[str] = None
    found_via: Optional[str] = None  # job board / referral / etc.
    track: Optional[str] = None
    next_action: Optional[str] = None
    notes: Optional[str] = None


class Transaction(Base, table=True):
    """Money that actually moved. Amounts are positive; `kind` carries the
    direction, matching how the Notion export recorded it."""

    __tablename__ = "transactions"
    name: str = Field(index=True)
    amount: Optional[float] = None
    occurred_on: Optional[date] = Field(default=None, index=True)
    kind: Optional[str] = Field(default=None, index=True)  # income | expense
    category: Optional[str] = Field(default=None, index=True)
    notes: Optional[str] = None


class Budget(Base, table=True):
    """A recurring money commitment — a budget envelope or a standing bill.
    Both shapes from the Notion export live here: they answer the same
    question ("what do I owe, how often"), only one is planned and the other
    is already committed."""

    __tablename__ = "budgets"
    name: str = Field(index=True)
    amount: Optional[float] = None
    frequency: Optional[str] = Field(default=None, index=True)  # Monthly | Yearly
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None
    last_paid: Optional[date] = None
    paid: Optional[bool] = None
    category: Optional[str] = Field(default=None, index=True)


class Learning(Base, table=True):
    __tablename__ = "learning"
    name: str = Field(index=True)
    status: Optional[str] = Field(default=None, index=True)
    url: Optional[str] = None
    via: Optional[str] = None  # where it came from (see JobApplication.found_via)
    notes: Optional[str] = None


class Collection(Base, table=True):
    """Small Notion databases kept whole but not yet modelled.

    Rather than invent a half-empty table per database, each row keeps its
    original columns in `raw` and names which database it came from. Nothing
    is lost, and promoting one to a real module later is an ordinary
    migration. Hidden from the sidebar; browsable under /admin."""

    __tablename__ = "collections"
    title: str = Field(index=True)
    collection: Optional[str] = Field(default=None, index=True)
    summary: Optional[str] = None  # the row's other columns, read as one line


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


class SystemLog(SQLModel, table=True):
    """Application events — what happened *to the system*, not what a process printed.

    journald already holds stdout/stderr for both services and rotates it; this
    table is the other half: unhandled errors, check results, backup and import
    outcomes. Keeping it in Postgres makes it queryable next to the data it
    describes, and puts it inside the same `pg_dump` that protects everything
    else. Access-log noise deliberately stays out — journald is better at that
    and this table would drown in it.
    """

    __tablename__ = "system_log"
    id: Optional[int] = Field(default=None, primary_key=True)
    at: datetime = Field(default_factory=utcnow, index=True)
    level: str = Field(default="info", index=True)  # debug | info | warn | error
    source: str = Field(default="api", index=True)  # api | web | check | backup | import
    # Dotted slug, e.g. "check.backup_fresh" or "http.error". Stable across
    # runs so a check's history can be pulled with one indexed lookup.
    event: str = Field(default="", index=True)
    message: str = ""
    detail: dict = Field(default_factory=dict, sa_type=JSONB)
