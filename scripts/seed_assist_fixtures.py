"""Planted money data for exercising the assist rules lane.

The money rules (budget_trend, txn_duplicate) run only against local Postgres,
and real data doesn't reliably contain the patterns they exist to catch. This
seeds a known set — a rising utility, a double-billed monthly, an unpaid
recurring — under obviously fake vendor names, every row tagged
`assist-fixture` so cleanup is one statement. The same file is where the
future local-model lane's money prompts will be developed before they ever
see a real bill.

    .venv/bin/python scripts/seed_assist_fixtures.py          # plant
    .venv/bin/python scripts/seed_assist_fixtures.py --clean  # remove
"""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select  # noqa: E402

from app.db import engine  # noqa: E402
from app.models import Budget, Transaction  # noqa: E402

TAG = "assist-fixture"

# Fixture bills live in 2020, far from any real month: the rules match them by
# *name* (fixture vendors are their own namespace), so they still fire — but
# "latest month with data" summaries on the Money page and Overview never see
# them, and real cashflow stays real. Those surfaces also skip the tag
# explicitly; the old date is the belt to that suspender.
FIXTURE_YEAR = 2020


def month_back(n: int, day: int = 14) -> date:
    """The `day`-th of the month n months back from Dec of the fixture year."""
    m = 12 - n
    return date(FIXTURE_YEAR, m, min(day, 28))


BUDGETS = [
    # budget_trend: three rising bills, latest above the envelope → suggest ~$135.
    dict(name="Fixture Power Co", amount=100.0, frequency="Monthly", paid=True),
    # txn_duplicate: billed twice in one month.
    dict(name="Fixture Wireless", amount=275.0, frequency="Monthly", paid=True),
    # the unpaid-recurring count on the Money screen.
    dict(name="Fixture Storage Unit", amount=85.0, frequency="Monthly", paid=False),
]

TXNS = [
    dict(name="Fixture Power Co", amount=100.0, occurred_on=month_back(3), kind="expense", category="Utilities"),
    dict(name="Fixture Power Co", amount=128.0, occurred_on=month_back(2), kind="expense", category="Utilities"),
    dict(name="Fixture Power Co", amount=142.0, occurred_on=month_back(1), kind="expense", category="Utilities"),
    dict(name="Fixture Wireless", amount=275.0, occurred_on=month_back(1, day=8), kind="expense", category="Utilities"),
    dict(name="Fixture Wireless", amount=275.0, occurred_on=month_back(1, day=21), kind="expense", category="Utilities"),
]


def clean(session: Session) -> int:
    n = 0
    for model in (Budget, Transaction):
        for row in session.exec(select(model)).all():
            if TAG in (row.tags or []):
                session.delete(row)
                n += 1
    session.commit()
    return n


def seed(session: Session) -> int:
    for spec in BUDGETS:
        session.add(Budget(**spec, tags=[TAG], source=TAG))
    for spec in TXNS:
        session.add(Transaction(**spec, tags=[TAG], source=TAG))
    session.commit()
    return len(BUDGETS) + len(TXNS)


if __name__ == "__main__":
    with Session(engine) as session:
        if "--clean" in sys.argv:
            print(f"removed {clean(session)} fixture rows")
        else:
            clean(session)  # re-running replants rather than duplicating
            print(f"planted {seed(session)} fixture rows (tag: {TAG})")
