"""What a project takes from the project it hangs under.

A song under an album under a tour shows the album's deadline where it has
none, and the tour's where the album has none either. Resolved at read time
rather than stored, so editing the album moves every child that hasn't
overridden it.

The browser walks the same chain in `web/src/lib/projects/inherit.ts` — that
copy exists because the tracker edits optimistically and has to resolve before
anything reaches the server. This one is what every *other* surface reads: the
calendar, the home screen, and anything else consuming `/projects`.

Inherited values are exposed as separate read-only fields (`due_effective`,
`due_from`) rather than by overwriting `due`. A caller that wants to know what
this project itself says still can, which is what the tracker needs to tell
"inherited" from "set here" in the UI.
"""

from __future__ import annotations

from sqlmodel import Session, select

from app.models import Project

# A chain is two or three deep in practice. The cap is a backstop against a
# cycle reaching the database another way — the UI refuses to create one, but
# a row edited by hand could still hold it, and this walk must terminate.
MAX_DEPTH = 20

# Fields that flow down. Status, health and phases deliberately don't: those
# are each project's own progress, and inheriting them would make a song look
# finished because its album is.
INHERITED = ("due", "start")


def _ancestors(pid: int | None, parents: dict[int, int | None]) -> list[int]:
    """Ids above `pid`, nearest first. Stops on a repeat, so a cycle yields a
    finite chain instead of looping."""
    seen: set[int] = set()
    chain: list[int] = []
    cur = parents.get(pid) if pid is not None else None
    while cur is not None and cur not in seen and len(chain) < MAX_DEPTH:
        seen.add(cur)
        chain.append(cur)
        cur = parents.get(cur)
    return chain


def decorate_projects(rows: list[Project], session: Session) -> list[dict]:
    """Add `<field>_effective` and `<field>_from` for everything that flows.

    `_from` names the ancestor a value came from, and is null when the project
    supplied it itself — that difference is the whole point, so a UI can show
    an inherited date differently from one that was set locally.
    """
    # The whole table, since a listed row's parent may not be in `rows`.
    index = {
        r[0]: r
        for r in session.exec(
            select(Project.id, Project.parent_id, Project.name, Project.due, Project.start)
        ).all()
    }
    parents = {pid: row[1] for pid, row in index.items()}
    col = {"due": 3, "start": 4}

    out: list[dict] = []
    for obj in rows:
        data = obj.model_dump()
        chain = _ancestors(obj.id, parents)
        for field in INHERITED:
            own = getattr(obj, field, None)
            if own:
                data[f"{field}_effective"] = own
                data[f"{field}_from"] = None
                continue
            value = source = None
            for aid in chain:
                candidate = index[aid][col[field]]
                if candidate:
                    value, source = candidate, index[aid][2]
                    break
            data[f"{field}_effective"] = value
            data[f"{field}_from"] = source
        out.append(data)
    return out
