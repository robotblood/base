#!/usr/bin/env python3
"""Run every self-check, record the results, and speak up when something breaks.

Run by base-selfcheck.timer every 15 minutes, and safe to run by hand:

    ~/base/.venv/bin/python ~/base/scripts/selfcheck.py
    ~/base/.venv/bin/python ~/base/scripts/selfcheck.py --quiet   # no notification

This is a standalone process rather than an API endpoint on purpose: it has to
be able to report that base-api is down, which it could not do if it were
served by base-api. It talks to Postgres directly for the same reason.
"""
import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import logs  # noqa: E402
from app.checks import run_all  # noqa: E402

EVENT_PREFIX = "check."


def notify(title: str, body: str, urgent: bool) -> None:
    """Desktop notification. Best-effort — a headless run just skips it."""
    try:
        subprocess.run(
            [
                "notify-send",
                "--app-name=base",
                f"--urgency={'critical' if urgent else 'normal'}",
                title,
                body,
            ],
            timeout=5,
            check=False,
        )
    except Exception:  # noqa: BLE001 — no desktop session is not an error
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quiet", action="store_true", help="skip desktop notifications")
    parser.add_argument("--no-prune", action="store_true", help="keep expired log entries")
    args = parser.parse_args()

    # What each check said last time, so we can alert on a *transition* rather
    # than nagging every quarter hour about a drive that is still unplugged.
    previous = logs.latest_by_event(EVENT_PREFIX)
    results = run_all()

    newly_broken = []
    recovered = []

    for r in results:
        event = f"{EVENT_PREFIX}{r.name}"
        was = previous.get(event, {}).get("level")
        logs.log(
            event,
            r.message,
            level=r.level,
            source="check",
            detail={**r.detail, "status": r.status},
        )
        if r.status in ("fail", "warn") and was in (None, "info"):
            newly_broken.append(r)
        elif r.status == "ok" and was in ("warn", "error"):
            recovered.append(r)

    failing = [r for r in results if r.status == "fail"]
    warning = [r for r in results if r.status == "warn"]

    logs.log(
        "check.run",
        f"{len(results)} checks — {len(failing)} failing, {len(warning)} warning",
        level="error" if failing else "warn" if warning else "info",
        source="check",
        detail={
            "failing": [r.name for r in failing],
            "warning": [r.name for r in warning],
            "newly_broken": [r.name for r in newly_broken],
            "recovered": [r.name for r in recovered],
        },
    )

    if not args.no_prune:
        logs.prune()

    if not args.quiet and newly_broken:
        worst = "fail" if any(r.status == "fail" for r in newly_broken) else "warn"
        notify(
            f"base: {len(newly_broken)} new problem{'s' if len(newly_broken) > 1 else ''}",
            "\n".join(f"• {r.message}" for r in newly_broken[:4]),
            urgent=worst == "fail",
        )
    if not args.quiet and recovered and not newly_broken:
        notify("base: back to normal", "\n".join(f"• {r.name}" for r in recovered[:4]), urgent=False)

    for r in results:
        marker = {"ok": " ok ", "warn": "warn", "fail": "FAIL"}[r.status]
        print(f"[{marker}] {r.name:18} {r.message}")

    return 1 if failing else 0


if __name__ == "__main__":
    sys.exit(main())
