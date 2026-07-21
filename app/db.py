from collections.abc import Iterator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

# echo=False keeps logs quiet; flip to True to see SQL during debugging.
engine = create_engine(settings.database_url, echo=False, pool_pre_ping=True)


def _ensure_columns() -> None:
    """Add any model columns missing from an already-created table.

    ``create_all`` creates missing *tables* but never alters existing ones, so a
    newly declared column (e.g. a new link like ``todos.project_id``) would be
    invisible on a database that already has data. This is a tiny, additive
    "migration": for every model column absent from its live table, emit an
    ``ALTER TABLE ... ADD COLUMN`` with the column's own compiled SQL type. New
    columns are always nullable/defaulted here, so this is safe on existing rows.
    """
    insp = inspect(engine)
    with engine.begin() as conn:
        for table in SQLModel.metadata.tables.values():
            if not insp.has_table(table.name):
                continue
            live = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in live:
                    continue
                col_type = col.type.compile(engine.dialect)
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type}'))


def init_db() -> None:
    """Create all tables. Import models first so they register on SQLModel.metadata."""
    from app import models  # noqa: F401  (registers tables)

    SQLModel.metadata.create_all(engine)
    _ensure_columns()


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
