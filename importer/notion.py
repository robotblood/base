"""Helpers for reading a Notion Markdown+CSV export.

Notion exports each database as `<Name> <hash>_all.csv`. Alongside it sits a
folder `<Name>/` containing one `<Title> <hash>.md` per row holding the page
body. We match rows to bodies by their (normalised) title.
"""

from __future__ import annotations

import csv
import re
from datetime import date, datetime
from pathlib import Path

_HASH_RE = re.compile(r"\s+[0-9a-f]{32}(?=\.|$)")  # trailing " <32 hex>" in file names


def read_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8-sig") as fh:
        return [dict(row) for row in csv.DictReader(fh)]


def norm(title: str) -> str:
    """Normalise a title for matching CSV rows against .md file names.

    Notion sanitises page titles when it writes file names (e.g. ':' becomes a
    space), so we collapse every run of non-alphanumeric characters to a single
    space on both sides of the comparison.
    """
    return re.sub(r"[^a-z0-9]+", " ", (title or "").lower()).strip()


def page_bodies(csv_path: Path) -> dict[str, str]:
    """Return {normalised_title: markdown_body} for the DB's row pages."""
    base = re.sub(r"\s+[0-9a-f]{32}_all\.csv$", "", csv_path.name)
    folder = csv_path.parent / base
    out: dict[str, str] = {}
    if not folder.is_dir():
        return out
    for md in folder.glob("*.md"):
        title = _HASH_RE.sub("", md.stem)
        key = norm(title)
        if key and key not in out:
            try:
                out[key] = md.read_text(encoding="utf-8")
            except OSError:
                pass
    return out


def split_tags(value: str | None) -> list[str]:
    """Notion multi-select values are comma-separated."""
    if not value:
        return []
    return [t.strip() for t in value.split(",") if t.strip()]


def _first(value: str | None) -> str | None:
    """Notion date ranges look like 'a → b'; keep the start."""
    if not value:
        return None
    return re.split(r"[→\-]{1,2}>?", value)[0].strip() or None


_DATE_FORMATS = ["%m/%d/%Y", "%Y-%m-%d", "%B %d, %Y", "%b %d, %Y"]
_DATETIME_FORMATS = [
    "%B %d, %Y %I:%M %p",
    "%b %d, %Y %I:%M %p",
    "%m/%d/%Y %I:%M %p",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%dT%H:%M:%S",
]


def parse_date(value: str | None) -> date | None:
    raw = _first(value)
    if not raw:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    dt = parse_datetime(value)
    return dt.date() if dt else None


def parse_datetime(value: str | None) -> datetime | None:
    raw = _first(value)
    if not raw:
        return None
    for fmt in _DATETIME_FORMATS:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def to_int(value: str | None) -> int | None:
    if not value:
        return None
    m = re.search(r"-?\d+", value.replace(",", ""))
    return int(m.group()) if m else None


def to_float(value: str | None) -> float | None:
    if not value:
        return None
    m = re.search(r"-?\d+(\.\d+)?", value.replace(",", ""))
    return float(m.group()) if m else None
