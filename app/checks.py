"""Named assertions about the running system.

Each check answers one question and returns ok / warn / fail with enough detail
to act on. They are written to be run from a standalone process (see
`scripts/selfcheck.py`) rather than served by the API, for the same reason the
health page's host probes live in the web layer: a check that reports
"base-api is down" must not need base-api to say so.

Checks must be cheap and must never raise — a check that throws is reported as
a failing check, not a crashed run.
"""
import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

HOME = Path.home()
PROJECT = Path(__file__).resolve().parent.parent
WEB = PROJECT / "web"
API_BASE = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")
WEB_BASE = os.environ.get("WEB_BASE_URL", "http://127.0.0.1:3000")


@dataclass
class Result:
    name: str
    status: str  # ok | warn | fail
    message: str
    detail: dict = field(default_factory=dict)

    @property
    def level(self) -> str:
        return {"ok": "info", "warn": "warn", "fail": "error"}[self.status]


def _get(url: str, timeout: float = 5.0) -> tuple[int, str]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as res:
            return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:  # noqa: BLE001 — unreachable is a status, not an exception
        return 0, ""


def _systemd(unit: str, prop: str) -> str:
    try:
        out = subprocess.run(
            ["systemctl", "--user", "show", unit, f"--property={prop}", "--value"],
            capture_output=True, text=True, timeout=5,
        )
        return out.stdout.strip()
    except Exception:  # noqa: BLE001
        return ""


# --------------------------------------------------------------------- checks


def check_api_responds() -> Result:
    status, body = _get(f"{API_BASE}/health")
    if status != 200:
        return Result("api_responds", "fail", f"API did not answer /health (status {status or 'unreachable'})")
    try:
        db_ok = json.loads(body).get("db", {}).get("ok") is True
    except ValueError:
        return Result("api_responds", "fail", "API returned unparseable /health")
    if not db_ok:
        return Result("api_responds", "fail", "API is up but cannot reach the database")
    return Result("api_responds", "ok", "API and database responding")


def check_web_routes() -> Result:
    """Fetch the routes the dashboard is actually made of.

    This is the check that catches a rebuild landing under a running server:
    adapter-node imports its route chunks lazily, so replacing `build/` leaves
    the live process reaching for hashed files that no longer exist. Every page
    keeps working until someone opens the one route whose chunk went missing,
    and then it 500s with nothing to announce it.
    """
    routes = ["/", "/todos", "/notes", "/projects", "/people", "/calendar", "/admin/health"]
    bad: list[dict] = []
    for route in routes:
        status, _ = _get(f"{WEB_BASE}{route}", timeout=10)
        if status != 200:
            bad.append({"route": route, "status": status})
    if bad:
        listed = ", ".join(f"{b['route']} → {b['status'] or 'unreachable'}" for b in bad)
        return Result(
            "web_routes", "fail",
            f"{len(bad)} of {len(routes)} dashboard routes are not serving: {listed}",
            {"failed": bad, "checked": routes},
        )
    return Result("web_routes", "ok", f"all {len(routes)} sampled routes return 200")


def check_build_current() -> Result:
    """Is the running web server older than the build it is serving?

    `npm run build` writes into `build/` in place. Until the service restarts,
    the process is holding a manifest that no longer matches what is on disk —
    the direct cause of the missing-chunk 500s above.
    """
    # adapter-node's entry point. Its mtime moves on every build, and the whole
    # tree — including the lazily-imported chunks — is rewritten with it.
    entry = WEB / "build" / "index.js"
    if not entry.exists():
        return Result("build_current", "warn", "No production build found in web/build")
    built_at = datetime.fromtimestamp(entry.stat().st_mtime).astimezone()
    stamp = _systemd("base-web.service", "ExecMainStartTimestamp")
    match = re.search(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})", stamp)
    if not match:
        return Result("build_current", "warn", "Could not parse base-web start time",
                      {"raw": stamp, "built_at": built_at.isoformat()})
    started_at = datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S").astimezone()
    # systemd records start times to the second while mtimes carry fractions,
    # so a build immediately followed by a restart can look a hair "newer".
    # A real forgotten restart grows past this within a minute, and the run
    # happens every quarter hour, so nothing slow-moving escapes.
    drift = (built_at - started_at).total_seconds()
    detail = {"built_at": built_at.isoformat(), "started_at": started_at.isoformat()}
    if drift > 60:
        return Result(
            "build_current", "fail",
            f"web/build is {int(drift // 60)}m newer than the running base-web — "
            "restart it (systemctl --user restart base-web)",
            detail,
        )
    return Result("build_current", "ok", "running server matches the build on disk", detail)


def check_module_registry() -> Result:
    """Do the backend, the frontend and the live API agree on the module list?

    `app/main.py` and `web/src/lib/modules.ts` are kept in step by hand, and
    the running API is a third opinion — it serves whatever it was started
    with. Drift here is silent: a module exists in code and simply never shows
    up, which reads as "I haven't built that yet" rather than "restart me".
    """
    try:
        from app.main import MODULES  # imported late: this is a check, not a dependency

        backend = {name for _, name, _ in MODULES}
    except Exception as exc:  # noqa: BLE001
        return Result("module_registry", "fail", f"Could not read backend modules: {exc}")

    ts = WEB / "src" / "lib" / "modules.ts"
    frontend = set(re.findall(r"^\s*key: '([a-z_]+)'", ts.read_text(), re.M)) if ts.exists() else set()

    status, body = _get(f"{API_BASE}/stats")
    live = set(json.loads(body)) if status == 200 and body else set()

    missing_frontend = sorted(backend - frontend)
    missing_live = sorted(backend - live) if live else []
    orphan_frontend = sorted(frontend - backend)

    problems = []
    if missing_live:
        problems.append(f"running API is missing {', '.join(missing_live)} (restart base-api)")
    if missing_frontend:
        problems.append(f"not registered in modules.ts: {', '.join(missing_frontend)}")
    if orphan_frontend:
        problems.append(f"in modules.ts but not the backend: {', '.join(orphan_frontend)}")

    detail = {
        "backend": sorted(backend),
        "frontend": sorted(frontend),
        "live": sorted(live),
    }
    if problems:
        return Result("module_registry", "warn", "; ".join(problems), detail)
    return Result("module_registry", "ok", f"{len(backend)} modules agree across backend, frontend and API", detail)


def check_backup_fresh() -> Result:
    backup_dir = Path(os.environ.get("BACKUP_DIR", HOME / "backups" / "base"))
    if not backup_dir.exists():
        return Result("backup_fresh", "fail", f"Backup directory missing: {backup_dir}")
    dumps = sorted(backup_dir.glob("*.dump"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not dumps:
        return Result("backup_fresh", "fail", "No snapshots — nothing to restore from")
    newest = dumps[0]
    age_h = (datetime.now().timestamp() - newest.stat().st_mtime) / 3600
    detail = {"newest": newest.name, "age_hours": round(age_h, 1), "count": len(dumps)}
    if age_h > 48:
        return Result("backup_fresh", "fail", f"Newest snapshot is {age_h / 24:.1f} days old", detail)
    if age_h > 26:
        return Result("backup_fresh", "warn", f"Newest snapshot is {age_h:.0f}h old", detail)
    return Result("backup_fresh", "ok", f"snapshot {age_h:.0f}h old, {len(dumps)} kept", detail)


def check_disk() -> Result:
    usage = os.statvfs(HOME)
    total = usage.f_blocks * usage.f_frsize
    free = usage.f_bavail * usage.f_frsize
    pct = 100 - (free / total * 100) if total else 0
    detail = {"free_gb": round(free / 1e9, 1), "used_pct": round(pct, 1)}
    if pct >= 95:
        return Result("disk", "fail", f"Disk {pct:.0f}% full", detail)
    if pct >= 85:
        return Result("disk", "warn", f"Disk {pct:.0f}% full", detail)
    return Result("disk", "ok", f"{free / 1e9:.0f} GB free ({pct:.0f}% used)", detail)


def check_services() -> Result:
    units = ["base-api.service", "base-web.service", "base-backup.timer"]
    bad = [u for u in units if _systemd(u, "ActiveState") != "active"]
    if bad:
        return Result("services", "fail", f"not active: {', '.join(bad)}", {"inactive": bad})
    return Result("services", "ok", f"all {len(units)} units active")


def check_linked_folders() -> Result:
    status, body = _get(f"{API_BASE}/health/paths", timeout=30)
    if status != 200:
        return Result("linked_folders", "warn", "Could not run the path check (API unreachable)")
    data = json.loads(body)
    broken = data.get("total_broken", 0)
    if not broken:
        return Result("linked_folders", "ok", f"all {data.get('total_with_path', 0)} linked folders resolve")
    groups = data.get("groups", [])
    roots = ", ".join(g["root"] for g in groups[:3])
    return Result(
        "linked_folders", "warn",
        f"{broken} linked folders unreachable across {len(groups)} location(s): {roots}",
        {"groups": groups[:5], "total_broken": broken},
    )


# Order matters only for readability in the log.
CHECKS: list[Callable[[], Result]] = [
    check_services,
    check_api_responds,
    check_web_routes,
    check_build_current,
    check_module_registry,
    check_backup_fresh,
    check_disk,
    check_linked_folders,
]


def run_all() -> list[Result]:
    """Every check, each isolated — one that throws becomes a failing result
    rather than taking the run down with it."""
    results: list[Result] = []
    for check in CHECKS:
        name = check.__name__.removeprefix("check_")
        try:
            results.append(check())
        except Exception as exc:  # noqa: BLE001
            results.append(
                Result(name, "fail", f"check raised {type(exc).__name__}: {exc}")
            )
    return results
