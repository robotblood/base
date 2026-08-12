"""The assist system: suggestions proposed by machines, decided by a human.

Two lanes write into one queue (the `suggestions` table), and the queue is the
only interface between them and the rest of the system:

  - The **rules lane** (this file): six deterministic checks over Postgres.
    Runs hourly and on demand, fully local, and is the only lane that reads
    the money tables.
  - The **enrichment lane** (a cloud pass today, a local model later): POSTs
    through the same endpoint, sourced from `GET /assist/context` — whose
    query set deliberately contains no path into transactions/budgets, and
    which drops to the `base_assist_cloud` role (SELECT on four tables only)
    when that role exists, so the boundary is the database's to enforce.

Nothing outside this queue changes until a suggestion is accepted; Accept runs
the row's `action` through the APPLY table below. Dismissals suppress the
rule/target family for a cooldown — "dismiss teaches the model" starts life as
data, not weights.
"""
import asyncio
from datetime import date, datetime, timedelta, timezone
from statistics import median

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlmodel import Session, func, select

from app import models
from app.db import engine, get_session
from app.inherit import decorate_projects
from app.logs import log
from app.revisions import _aware

router = APIRouter(prefix="/assist", tags=["assist"])

KINDS = {"todo_triage", "project", "recurring", "enrich"}
# Statuses that mean a todo/project is out of play — mirror main.py's lists.
_TODO_CLOSED = ["done", "archived"]
_PROJECT_CLOSED = ["done", "archive", "archived", "complete", "completed", "cancelled"]

DISMISS_COOLDOWN_DAYS = 30
SNOOZE_DEFAULT_DAYS = 7


def _family(dedupe_key: str) -> str:
    """The suppression family — rule + target, without the variable tail.

    "budget_trend:45:135" and a later "budget_trend:45:150" are different
    observations but the same conversation; a dismissal of one should quiet
    both for the cooldown.
    """
    return ":".join(dedupe_key.split(":")[:2])


# ---------------------------------------------------------------------------
# Apply handlers — everything Accept is allowed to do, one op each.
# A suggestion whose action names an op not in this table is refused at
# insert time, so the queue can never hold an unapplyable promise.
# ---------------------------------------------------------------------------


def _touch(obj) -> None:
    obj.updated_at = models.utcnow()


def _apply_todos_set_due(session: Session, a: dict) -> dict:
    todo = session.get(models.Todo, a["id"])
    if not todo:
        raise HTTPException(409, "todo no longer exists")
    todo.due = date.fromisoformat(a["due"])
    _touch(todo)
    session.add(todo)
    return {"todo": todo.id, "due": a["due"]}


def _apply_todos_set_due_bulk(session: Session, a: dict) -> dict:
    done = []
    for tid in a["ids"]:
        todo = session.get(models.Todo, tid)
        if not todo:
            continue  # a bulk accept applies to whoever is still around
        todo.due = date.fromisoformat(a["due"])
        _touch(todo)
        session.add(todo)
        done.append(tid)
    if not done:
        raise HTTPException(409, "none of the todos exist any more")
    return {"todos": done, "due": a["due"]}


def _apply_todos_create(session: Session, a: dict) -> dict:
    todo = models.Todo(title=a["title"], status="To Do", project_id=a.get("project_id"))
    todo.source_created_at = todo.created_at
    session.add(todo)
    session.flush()
    return {"created_todo": todo.id}


def _apply_todos_append_note(session: Session, a: dict) -> dict:
    """The enrichment landing spot: the shortlist goes onto the todo itself,
    where it's in front of you when you finally do the thing."""
    todo = session.get(models.Todo, a["id"])
    if not todo:
        raise HTTPException(409, "todo no longer exists")
    todo.notes = ((todo.notes or "").rstrip() + "\n\n" + a["text"].strip()).strip()
    _touch(todo)
    session.add(todo)
    return {"todo": todo.id}


def _apply_projects_set_status(session: Session, a: dict) -> dict:
    project = session.get(models.Project, a["id"])
    if not project:
        raise HTTPException(409, "project no longer exists")
    project.status = a["status"]
    _touch(project)
    session.add(project)
    return {"project": project.id, "status": a["status"]}


def _apply_budgets_set_amount(session: Session, a: dict) -> dict:
    budget = session.get(models.Budget, a["id"])
    if not budget:
        raise HTTPException(409, "budget no longer exists")
    budget.amount = float(a["amount"])
    _touch(budget)
    session.add(budget)
    return {"budget": budget.id, "amount": budget.amount}


def _apply_transactions_tag(session: Session, a: dict) -> dict:
    txn = session.get(models.Transaction, a["id"])
    if not txn:
        raise HTTPException(409, "transaction no longer exists")
    if a["tag"] not in (txn.tags or []):
        txn.tags = [*(txn.tags or []), a["tag"]]  # reassigned whole for ARRAY change tracking
        _touch(txn)
        session.add(txn)
    return {"transaction": txn.id, "tag": a["tag"]}


def _apply_notes_create(session: Session, a: dict) -> dict:
    note = models.Note(
        title=a["title"], body=a.get("body"), kind="note", project_id=a.get("project_id")
    )
    note.source_created_at = note.created_at
    session.add(note)
    session.flush()
    return {"created_note": note.id}


APPLY = {
    "todos.set_due": _apply_todos_set_due,
    "todos.set_due_bulk": _apply_todos_set_due_bulk,
    "todos.create": _apply_todos_create,
    "todos.append_note": _apply_todos_append_note,
    "projects.set_status": _apply_projects_set_status,
    "budgets.set_amount": _apply_budgets_set_amount,
    "transactions.tag": _apply_transactions_tag,
    "notes.create": _apply_notes_create,
}


# ---------------------------------------------------------------------------
# The rules — each returns draft dicts; the pass decides which become rows.
# A draft is: {source, kind, title, why, writes, action, dedupe_key}.
# ---------------------------------------------------------------------------


def _open_todos(session: Session):
    not_done = func.lower(func.coalesce(models.Todo.status, "")).not_in(_TODO_CLOSED)
    return session.exec(select(models.Todo).where(not_done)).all()


def _age_days(row, today: date) -> int:
    stamp = row.source_created_at or row.created_at
    return (today - stamp.date()).days


def _next_weekday(today: date, weekday: int, min_days: int = 3) -> date:
    """The next such weekday at least `min_days` out — a due date worth
    suggesting is one you could plausibly hit, not tomorrow morning."""
    d = today + timedelta(days=min_days)
    d += timedelta(days=(weekday - d.weekday()) % 7)
    return d


def _fmt_day(d: date) -> str:
    return d.strftime("%a %b %-d")


def rule_todo_undated(session: Session, today: date) -> list[dict]:
    """Old, open, undated todos — the top few by age, each offered a Friday."""
    todos = [t for t in _open_todos(session) if t.due is None]
    aged = sorted(
        (t for t in todos if _age_days(t, today) >= 14),
        key=lambda t: -_age_days(t, today),
    )[:3]
    if not aged:
        return []
    # How fast todos actually close here, for the provenance line.
    closed = session.exec(
        select(models.Todo).where(func.lower(func.coalesce(models.Todo.status, "")) == "done")
    ).all()
    spans = [
        (t.updated_at - (t.source_created_at or t.created_at)).days
        for t in closed
        if t.updated_at and (t.source_created_at or t.created_at)
    ]
    typical = round(median(spans)) if spans else None
    due = _next_weekday(today, weekday=4)  # Friday
    out = []
    for t in aged:
        why = f"captured {_age_days(t, today)}d ago · no due date"
        # A sub-day median is imported rows closing at import time, not a
        # real cadence — saying "~0d" would be provenance theater.
        if typical is not None and typical >= 1:
            why += f" · similar todos close in ~{typical}d"
        out.append(
            {
                "source": "rule:todo_undated",
                "kind": "todo_triage",
                "title": f"Give “{t.title}” a due date — {_fmt_day(due)}",
                "why": why,
                "writes": "Todos",
                "action": {"op": "todos.set_due", "id": t.id, "due": due.isoformat()},
                "dedupe_key": f"todo_undated:{t.id}",
            }
        )
    return out


def rule_todo_batch(session: Session, today: date) -> list[dict]:
    """A pileup of undated todos — offer the five oldest a shared Sunday."""
    todos = _open_todos(session)
    undated = sorted(
        (t for t in todos if t.due is None), key=lambda t: -_age_days(t, today)
    )
    if len(undated) < 10:
        return []
    sunday = _next_weekday(today, weekday=6, min_days=1)
    top = undated[:5]
    return [
        {
            "source": "rule:todo_batch",
            "kind": "todo_triage",
            "title": f"{len(undated)} undated loose ends — batch the top 5 into a Sunday reset ({_fmt_day(sunday)})",
            "why": f"{len(todos)} open · {len(undated)} undated",
            "writes": "Todos",
            "action": {
                "op": "todos.set_due_bulk",
                "ids": [t.id for t in top],
                "due": sunday.isoformat(),
            },
            # Keyed to the Sunday, so declining this week's reset doesn't
            # silence next week's.
            "dedupe_key": f"todo_batch:{sunday.isoformat()}",
        }
    ]


def _open_projects(session: Session) -> list[dict]:
    rows = session.exec(
        select(models.Project).where(
            func.lower(func.coalesce(models.Project.status, "")).not_in(_PROJECT_CLOSED)
        )
    ).all()
    return decorate_projects(list(rows), session)


def _open_task_counts(session: Session, pids: list[int]) -> dict[int, int]:
    if not pids:
        return {}
    not_done = func.lower(func.coalesce(models.Todo.status, "")).not_in(_TODO_CLOSED)
    rows = session.exec(
        select(models.Todo.project_id, func.count())
        .where(models.Todo.project_id.in_(pids), not_done)
        .group_by(models.Todo.project_id)
    ).all()
    return {pid: n for pid, n in rows if pid is not None}


def rule_project_stalled(session: Session, today: date) -> list[dict]:
    """Past its date and not flagged — propose the status say so."""
    projects = _open_projects(session)
    tasks = _open_task_counts(session, [p["id"] for p in projects])
    out = []
    for p in projects:
        if (p.get("status") or "").lower() == "needs attention":
            continue
        due = p.get("due_effective") or p.get("due")
        if not due:
            continue
        due = date.fromisoformat(due) if isinstance(due, str) else due
        overdue = (today - due).days
        if overdue <= 0:
            continue
        idle = (models.utcnow().date() - p["updated_at"].date()).days if p.get("updated_at") else None
        why = f"due {due.strftime('%b %-d')} ({overdue}d overdue) · {tasks.get(p['id'], 0)} open task{'s' if tasks.get(p['id'], 0) != 1 else ''}"
        if idle is not None:
            why += f" · no activity {idle}d"
        out.append(
            {
                "source": "rule:project_stalled",
                "kind": "project",
                "title": f"Move {p['name']} → Needs Attention",
                "why": why,
                "writes": "Projects",
                "action": {"op": "projects.set_status", "id": p["id"], "status": "Needs Attention"},
                "dedupe_key": f"project_stalled:{p['id']}",
            }
        )
    return out


def rule_project_empty(session: Session, today: date) -> list[dict]:
    """A date bearing down on a project with nothing attached to it."""
    projects = _open_projects(session)
    tasks = _open_task_counts(session, [p["id"] for p in projects])
    # Upcoming performances per project, for the "show in Nd" provenance.
    shows: dict[int, datetime] = {}
    rows = session.exec(
        select(models.Event.project_id, func.min(models.Event.starts_at))
        .where(
            models.Event.kind == "performance",
            models.Event.starts_at.is_not(None),
            models.Event.starts_at >= datetime.now(),
        )
        .group_by(models.Event.project_id)
    ).all()
    for pid, starts in rows:
        if pid is not None:
            shows[pid] = starts
    out = []
    for p in projects:
        if tasks.get(p["id"], 0) > 0:
            continue
        show_at = shows.get(p["id"])
        due = p.get("due_effective") or p.get("due")
        due = date.fromisoformat(due) if isinstance(due, str) else due
        if show_at is not None:
            days = (show_at.date() - today).days
            why = f"show in {days}d · 0 tasks"
        elif due is not None and 0 <= (due - today).days <= 60:
            why = f"due in {(due - today).days}d · 0 open tasks"
        else:
            continue
        out.append(
            {
                "source": "rule:project_empty",
                "kind": "project",
                "title": f"{p['name']} has nothing attached — add a first task",
                "why": why,
                "writes": "Todos",
                "action": {
                    "op": "todos.create",
                    "project_id": p["id"],
                    "title": f"Sketch the plan — {p['name']}",
                },
                "dedupe_key": f"project_empty:{p['id']}",
            }
        )
    return out


def _round5(x: float) -> int:
    return int(round(x / 5.0) * 5)


def rule_budget_trend(session: Session, today: date) -> list[dict]:
    """A monthly bill outgrowing its budget. Money stays in this lane."""
    budgets = session.exec(
        select(models.Budget).where(func.lower(func.coalesce(models.Budget.frequency, "")) == "monthly")
    ).all()
    out = []
    for b in budgets:
        if not b.amount:
            continue
        txns = session.exec(
            select(models.Transaction)
            .where(
                models.Transaction.name.ilike(f"%{b.name}%"),
                func.lower(func.coalesce(models.Transaction.kind, "")) == "expense",
                models.Transaction.occurred_on.is_not(None),
            )
            .order_by(models.Transaction.occurred_on.desc())
            .limit(3)
        ).all()
        if len(txns) < 3:
            continue
        newest_first = [t.amount or 0 for t in txns]
        oldest_first = list(reversed(newest_first))
        rising = oldest_first[0] < oldest_first[1] < oldest_first[2]
        if not rising or oldest_first[2] <= b.amount:
            continue
        proposal = _round5((oldest_first[1] + oldest_first[2]) / 2)
        bills = " · ".join(f"${v:g}" for v in oldest_first)
        out.append(
            {
                "source": "rule:budget_trend",
                "kind": "recurring",
                "title": f"{b.name} trending up — raise budget ${b.amount:g} → ${proposal}",
                "why": f"last 3 bills: {bills}",
                "writes": "Budgets",
                "action": {"op": "budgets.set_amount", "id": b.id, "amount": proposal},
                # The proposal is in the key: if the bills keep climbing, a new
                # number is a new suggestion (the dismissal family still quiets
                # repeats within the cooldown).
                "dedupe_key": f"budget_trend:{b.id}:{proposal}",
            }
        )
    return out


def rule_txn_duplicate(session: Session, today: date) -> list[dict]:
    """The same name and amount twice inside a month — worth a look when the
    name is a monthly bill (or the amount is real money)."""
    monthly = {
        b.name.lower()
        for b in session.exec(
            select(models.Budget).where(
                func.lower(func.coalesce(models.Budget.frequency, "")) == "monthly"
            )
        ).all()
    }
    txns = session.exec(
        select(models.Transaction)
        .where(
            func.lower(func.coalesce(models.Transaction.kind, "")) == "expense",
            models.Transaction.occurred_on.is_not(None),
        )
        .order_by(models.Transaction.occurred_on)
    ).all()
    by_key: dict[tuple[str, float], list] = {}
    for t in txns:
        if not t.amount:
            continue
        by_key.setdefault((t.name.lower(), t.amount), []).append(t)
    out = []
    for (name, amount), group in by_key.items():
        for older, newer in zip(group, group[1:]):
            gap = (newer.occurred_on - older.occurred_on).days
            if not (1 <= gap <= 24):
                continue
            is_bill = name in monthly
            if not is_bill and amount < 50:
                continue  # two coffees in a week is life, not fraud
            fmt = lambda d: d.strftime("%b %-d")  # noqa: E731
            why = f"{fmt(older.occurred_on)} ${amount:g} · {fmt(newer.occurred_on)} ${amount:g}"
            if is_bill:
                why += " · cadence is monthly"
            out.append(
                {
                    "source": "rule:txn_duplicate",
                    "kind": "recurring",
                    "title": f"{newer.name} billed twice in {older.occurred_on.strftime('%B')} — flag possible duplicate",
                    "why": why,
                    "writes": "Transactions",
                    "action": {"op": "transactions.tag", "id": newer.id, "tag": "possible-duplicate"},
                    "dedupe_key": f"txn_duplicate:{older.id}:{newer.id}",
                }
            )
    return out


RULES = [
    rule_todo_undated,
    rule_todo_batch,
    rule_project_stalled,
    rule_project_empty,
    rule_budget_trend,
    rule_txn_duplicate,
]


# ---------------------------------------------------------------------------
# The pass — drafts filtered through suppression, stale pendings expired.
# ---------------------------------------------------------------------------


def _scan_counts(session: Session) -> dict:
    counts = {}
    for model, label in (
        (models.Todo, "todos"),
        (models.Project, "projects"),
        (models.Transaction, "txns"),
        (models.Budget, "budgets"),
    ):
        counts[label] = session.exec(select(func.count()).select_from(model)).one()
    return counts


def run_rules_pass(session: Session) -> models.AssistPass:
    today = date.today()
    now = models.utcnow()

    # Snoozes that have slept their term wake as pending again — all lanes.
    for s in session.exec(
        select(models.Suggestion).where(
            models.Suggestion.status == "snoozed",
            models.Suggestion.snooze_until.is_not(None),
            models.Suggestion.snooze_until <= today,
        )
    ).all():
        s.status, s.status_at, s.snooze_until = "pending", now, None
        session.add(s)

    drafts: list[dict] = []
    for rule in RULES:
        # One broken rule must not take down the pass — it reports and the
        # others still run.
        try:
            drafts.extend(rule(session, today))
        except Exception as e:  # noqa: BLE001
            log("assist.rule_error", f"{rule.__name__}: {e}", level="error")

    existing = session.exec(select(models.Suggestion)).all()
    live_keys = {s.dedupe_key for s in existing if s.status in ("pending", "snoozed", "accepted")}
    cooldown_families = {
        _family(s.dedupe_key)
        for s in existing
        if s.status == "dismissed"
        and s.status_at
        # _aware: status_at reads back naive from the TIMESTAMP column, and
        # subtracting it from an aware utcnow() raises — which killed every
        # pass the moment any dismissal existed (see revisions._aware).
        and (now - _aware(s.status_at)).days < DISMISS_COOLDOWN_DAYS
    }

    # Pending rows the pass re-observes get their facts refreshed in place —
    # "18d overdue" must age with the calendar, not with the row.
    pending_by_key = {s.dedupe_key: s for s in existing if s.status == "pending"}

    created = suppressed = 0
    draft_keys = set()
    for d in drafts:
        draft_keys.add(d["dedupe_key"])
        if d["dedupe_key"] in live_keys or _family(d["dedupe_key"]) in cooldown_families:
            match = pending_by_key.get(d["dedupe_key"])
            if match and (match.title, match.why, match.action) != (d["title"], d["why"], d["action"]):
                match.title, match.why, match.action = d["title"], d["why"], d["action"]
                session.add(match)
            suppressed += 1
            continue
        session.add(models.Suggestion(**d))
        live_keys.add(d["dedupe_key"])
        created += 1

    # A pending rule suggestion whose observation no longer holds (the todo got
    # dated by hand, the bill went back down) leaves the queue by itself.
    expired = 0
    for s in existing:
        if s.status == "pending" and s.source.startswith("rule:") and s.dedupe_key not in draft_keys:
            s.status, s.status_at = "expired", now
            session.add(s)
            expired += 1

    entry = models.AssistPass(
        source="rules",
        scanned=_scan_counts(session),
        created=created,
        suppressed=suppressed,
        note=f"{expired} expired" if expired else None,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


# ---------------------------------------------------------------------------
# Scheduler — a plain asyncio loop; APScheduler would be a dependency for a
# sleep-until-the-hour we can write in four lines.
# ---------------------------------------------------------------------------


async def scheduler() -> None:
    # First pass shortly after boot, so a fresh start isn't an empty queue.
    await asyncio.sleep(5)
    while True:
        try:
            with Session(engine) as session:
                entry = await asyncio.to_thread(run_rules_pass, session)
            if entry.created:
                log("assist.pass", f"rules pass: {entry.created} new", detail=entry.scanned)
        except Exception as e:  # noqa: BLE001
            log("assist.pass_error", str(e), level="error")
        now = datetime.now()
        top = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
        await asyncio.sleep(max((top - now).total_seconds(), 60))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


def _stamp_utc(d: dict) -> dict:
    """Mark naive timestamps as UTC on the way out — same bug and same fix as
    logs._utc: a bare ISO string gets read as *local* time by the browser."""
    for key, value in d.items():
        if isinstance(value, datetime) and value.tzinfo is None:
            d[key] = value.replace(tzinfo=timezone.utc)
    return d


def _out(s: models.Suggestion) -> dict:
    d = _stamp_utc(s.model_dump())
    d["family"] = _family(s.dedupe_key)
    return d


@router.get("/suggestions")
def list_suggestions(
    status: str | None = None,
    limit: int = 100,
    session: Session = Depends(get_session),
):
    stmt = select(models.Suggestion).order_by(models.Suggestion.created_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(models.Suggestion.status == status)
    else:
        # The queue view: everything still talking, newest resolved for context.
        stmt = stmt.where(models.Suggestion.status != "expired")
    return [_out(s) for s in session.exec(stmt).all()]


@router.post("/suggestions", status_code=201)
def create_suggestion(payload: dict, session: Session = Depends(get_session)):
    """The write path for external lanes (the cloud pass, later a local model).

    The rules lane doesn't come through here — it writes in-process — so
    `source` must say who this actually is, and the action op must be one
    Accept knows how to apply.
    """
    for field in ("source", "kind", "title", "action", "dedupe_key"):
        if not payload.get(field):
            raise HTTPException(422, f"'{field}' is required")
    if payload["source"].startswith("rule:"):
        raise HTTPException(422, "rule: sources are reserved for the in-process rules lane")
    if payload["kind"] not in KINDS:
        raise HTTPException(422, f"kind must be one of {sorted(KINDS)}")
    op = payload["action"].get("op")
    if op not in APPLY:
        raise HTTPException(422, f"unknown action op '{op}' — known: {sorted(APPLY)}")

    now = models.utcnow()
    existing = session.exec(
        select(models.Suggestion).where(models.Suggestion.dedupe_key == payload["dedupe_key"])
    ).all()
    if any(s.status in ("pending", "snoozed", "accepted") for s in existing):
        return {"skipped": "duplicate", "dedupe_key": payload["dedupe_key"]}
    if any(
        s.status == "dismissed"
        and s.status_at
        and (now - _aware(s.status_at)).days < DISMISS_COOLDOWN_DAYS
        for s in existing
    ):
        return {"skipped": "dismissed_cooldown", "dedupe_key": payload["dedupe_key"]}

    s = models.Suggestion(
        source=payload["source"],
        kind=payload["kind"],
        title=payload["title"],
        why=payload.get("why", ""),
        writes=payload.get("writes", ""),
        action=payload["action"],
        dedupe_key=payload["dedupe_key"],
        detail=payload.get("detail", {}),
    )
    session.add(s)
    session.commit()
    session.refresh(s)
    return _out(s)


@router.patch("/suggestions/{sid}")
def edit_suggestion(sid: int, payload: dict, session: Session = Depends(get_session)):
    s = session.get(models.Suggestion, sid)
    if not s:
        raise HTTPException(404, "not found")
    if s.status != "pending":
        raise HTTPException(409, f"suggestion is {s.status}")
    if "title" in payload:
        s.edited_title = payload["title"]
    session.add(s)
    session.commit()
    session.refresh(s)
    return _out(s)


@router.post("/suggestions/{sid}/accept")
def accept_suggestion(sid: int, payload: dict | None = None, session: Session = Depends(get_session)):
    s = session.get(models.Suggestion, sid)
    if not s:
        raise HTTPException(404, "not found")
    if s.status not in ("pending", "snoozed"):
        raise HTTPException(409, f"suggestion is {s.status}")
    if payload and payload.get("title"):
        s.edited_title = payload["title"]

    action = dict(s.action)
    # An edited enrichment accepts the edited text, not the original draft.
    if action.get("op") == "todos.append_note" and s.edited_title:
        action["text"] = s.edited_title
    applied = APPLY[action["op"]](session, action)

    s.status, s.status_at = "accepted", models.utcnow()
    s.detail = {**s.detail, "applied": applied}
    session.add(s)
    session.commit()
    session.refresh(s)
    log("assist.accept", s.edited_title or s.title, detail={"id": s.id, **applied})
    return _out(s)


@router.post("/suggestions/{sid}/dismiss")
def dismiss_suggestion(sid: int, session: Session = Depends(get_session)):
    s = session.get(models.Suggestion, sid)
    if not s:
        raise HTTPException(404, "not found")
    if s.status not in ("pending", "snoozed"):
        raise HTTPException(409, f"suggestion is {s.status}")
    s.status, s.status_at = "dismissed", models.utcnow()
    session.add(s)
    session.commit()
    session.refresh(s)
    return _out(s)


@router.post("/suggestions/{sid}/snooze")
def snooze_suggestion(sid: int, payload: dict | None = None, session: Session = Depends(get_session)):
    s = session.get(models.Suggestion, sid)
    if not s:
        raise HTTPException(404, "not found")
    if s.status != "pending":
        raise HTTPException(409, f"suggestion is {s.status}")
    days = int((payload or {}).get("days", SNOOZE_DEFAULT_DAYS))
    s.status, s.status_at = "snoozed", models.utcnow()
    s.snooze_until = date.today() + timedelta(days=days)
    session.add(s)
    session.commit()
    session.refresh(s)
    return _out(s)


@router.post("/run")
def run_now(session: Session = Depends(get_session)):
    entry = run_rules_pass(session)
    return _stamp_utc(entry.model_dump())


@router.get("/passes")
def list_passes(limit: int = 10, session: Session = Depends(get_session)):
    rows = session.exec(
        select(models.AssistPass).order_by(models.AssistPass.at.desc()).limit(limit)
    ).all()
    return [_stamp_utc(r.model_dump()) for r in rows]


@router.post("/passes", status_code=201)
def record_pass(payload: dict, session: Session = Depends(get_session)):
    """External lanes log their runs here so the Assist screen's history is
    whole. The rules lane records its own in-process."""
    source = payload.get("source", "")
    if not source or source == "rules":
        raise HTTPException(422, "source is required and must not be 'rules'")
    entry = models.AssistPass(
        source=source,
        scanned=payload.get("scanned", {}),
        created=int(payload.get("created", 0)),
        suppressed=int(payload.get("suppressed", 0)),
        note=payload.get("note"),
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return _stamp_utc(entry.model_dump())


@router.get("/status")
def status(session: Session = Depends(get_session)):
    """The cheap read the Assist screen's sidebar card wants: queue depth,
    whether the DB guard role exists, and when the lanes last ran."""
    guard = True
    try:
        session.exec(text("SET LOCAL ROLE base_assist_cloud"))
        session.exec(text("RESET ROLE"))
    except Exception:  # noqa: BLE001
        session.rollback()
        guard = False
    pending = session.exec(
        select(func.count()).select_from(models.Suggestion).where(models.Suggestion.status == "pending")
    ).one()
    last = {}
    for source in ("rules", "claude"):
        row = session.exec(
            select(models.AssistPass)
            .where(models.AssistPass.source == source)
            .order_by(models.AssistPass.at.desc())
            .limit(1)
        ).first()
        if row:
            last[source] = row.at.replace(tzinfo=timezone.utc).isoformat()
    return {"pending": pending, "db_guard": guard, "last_pass": last}


@router.get("/context")
def cloud_context(session: Session = Depends(get_session)):
    """The bundle an *external* lane reasons over. Money is not in it.

    Two layers keep that true: this function contains no query against
    transactions/budgets (review the body — that's the contract), and when the
    `base_assist_cloud` role exists the whole transaction drops to it, so a
    money query added here by accident would error rather than answer.
    `db_guard` in the response says which layers are active.
    """
    guard = "on"
    try:
        session.exec(text("SET LOCAL ROLE base_assist_cloud"))
    except Exception:  # noqa: BLE001 — role not created yet; code-review layer only
        session.rollback()
        guard = "off — role base_assist_cloud not found (scripts/assist_role.sql)"

    today = date.today()
    todos = [
        {
            "id": t.id,
            "title": t.title,
            "status": t.status,
            "due": t.due.isoformat() if t.due else None,
            "age_days": _age_days(t, today),
            "project_id": t.project_id,
            "notes_chars": len(t.notes or ""),
        }
        for t in _open_todos(session)
    ]
    projects = _open_projects(session)
    tasks = _open_task_counts(session, [p["id"] for p in projects])
    shows_by_project: dict[int, list[dict]] = {}
    for e in session.exec(
        select(models.Event).where(
            models.Event.kind == "performance",
            models.Event.starts_at.is_not(None),
            models.Event.starts_at >= datetime.now(),
        )
    ).all():
        shows_by_project.setdefault(e.project_id, []).append(
            {
                "date": e.starts_at.date().isoformat(),
                "venue": e.title,
                "location": e.location,
                "status": e.status,
                "advance": (e.show or {}).get("advance"),
            }
        )
    project_out = [
        {
            "id": p["id"],
            "name": p["name"],
            "kind": p.get("kind"),
            "status": p.get("status"),
            "due": str(p["due_effective"]) if p.get("due_effective") else None,
            "open_tasks": tasks.get(p["id"], 0),
            "shows": shows_by_project.get(p["id"], []),
        }
        for p in projects
    ]
    notes = [
        {"id": n.id, "title": n.title, "kind": n.kind, "project_id": n.project_id}
        for n in session.exec(
            select(models.Note).order_by(models.Note.updated_at.desc()).limit(10)
        ).all()
    ]

    # What the human has decided lately — every lane learns from all verdicts.
    cutoff = models.utcnow() - timedelta(days=30)
    verdicts = [
        {
            "id": s.id,
            "source": s.source,
            "kind": s.kind,
            "title": s.title,
            "edited_title": s.edited_title,
            "status": s.status,
        }
        for s in session.exec(
            select(models.Suggestion)
            .where(models.Suggestion.status.in_(["accepted", "dismissed"]))
            .where(models.Suggestion.status_at >= cutoff)
            .order_by(models.Suggestion.status_at.desc())
        ).all()
    ]
    pending = [
        {"id": s.id, "source": s.source, "kind": s.kind, "title": s.title, "dedupe_key": s.dedupe_key}
        for s in session.exec(
            select(models.Suggestion).where(models.Suggestion.status.in_(["pending", "snoozed"]))
        ).all()
    ]

    return {
        "generated_at": models.utcnow().isoformat(),
        "db_guard": guard,
        "todos": todos,
        "projects": project_out,
        "recent_notes": notes,
        "verdicts": verdicts,
        "pending_suggestions": pending,
    }
