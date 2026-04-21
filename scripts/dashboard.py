"""
Offline dashboard — operational view over applications/*/metadata.json.

Works without the web app, without Vercel, without network. Reads the
on-disk metadata folder, classifies each application by archetype, and
prints five views: pipeline-by-status, today's actions, decay warnings,
archetype distribution, and staged discoveries from portal_scan.

Usage:
    python scripts/dashboard.py                # full dashboard
    python scripts/dashboard.py --view today   # single view
    python scripts/dashboard.py --view pipeline --status applied
    python scripts/dashboard.py --json         # machine-readable

Design notes:
- Stdlib only. No Textual/Rich dependency (those are a follow-up for
  interactive keyboard nav).
- Read-only against the local filesystem. No DB writes, no API calls.
- Tolerates partial metadata — surfaces what's there, flags gaps.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
APPLICATIONS_DIR = REPO_ROOT / "applications"
STAGE_DIR = REPO_ROOT / "pipeline" / "staging" / "discovered"

sys.path.insert(0, str(REPO_ROOT / "packages" / "scoring-rules"))
try:
    import classify_archetype  # type: ignore
except ImportError:
    classify_archetype = None  # archetype is optional


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

@dataclass
class App:
    folder: str
    company: str
    role: str
    status: str
    applied_date: str | None
    last_update: str | None
    url: str
    archetype: str = "general"
    match_band: str = ""

    def age_days(self, ref: date) -> int | None:
        candidate = self.last_update or self.applied_date
        if not candidate:
            return None
        try:
            d = datetime.fromisoformat(candidate[:10]).date()
        except ValueError:
            return None
        return (ref - d).days


@dataclass
class DashboardData:
    apps: list[App] = field(default_factory=list)
    staged_count: int = 0
    staged_latest: str | None = None


def _get_first(d: dict, keys: list[str], default: str = "") -> str:
    for k in keys:
        v = d.get(k)
        if v:
            return str(v)
    return default


def load_apps() -> list[App]:
    apps: list[App] = []
    if not APPLICATIONS_DIR.exists():
        return apps
    for folder in APPLICATIONS_DIR.iterdir():
        if not folder.is_dir():
            continue
        md = folder / "metadata.json"
        if not md.exists():
            continue
        try:
            meta = json.loads(md.read_text(encoding="utf-8", errors="replace"))
        except json.JSONDecodeError:
            continue

        role = _get_first(meta, ["role", "title", "job_title"])
        company = _get_first(meta, ["company", "company_name"])
        status = _get_first(meta, ["status", "application_status"], default="unknown").lower()
        applied = _get_first(meta, ["applied_date", "date_applied", "submitted_at"], default="")
        updated = _get_first(meta, ["last_update", "updated_at", "modified_at"], default="")
        url = _get_first(meta, ["job_url", "url", "jd_url", "apply_url", "career_url"], default="")

        archetype = "general"
        match_band = _get_first(meta, ["match_band", "overall", "tier"], default="")

        if classify_archetype and role:
            jd_file = folder / "job-description.md"
            jd = jd_file.read_text(encoding="utf-8", errors="replace") if jd_file.exists() else ""
            try:
                config = classify_archetype.load_config()
                result = classify_archetype.classify_archetype(role, jd, config=config)
                archetype = result.archetype
            except Exception:
                pass

        apps.append(App(
            folder=folder.name,
            company=company,
            role=role,
            status=status,
            applied_date=applied or None,
            last_update=updated or None,
            url=url,
            archetype=archetype,
            match_band=match_band,
        ))
    return apps


def load_staged() -> tuple[int, str | None]:
    if not STAGE_DIR.exists():
        return (0, None)
    files = sorted(STAGE_DIR.glob("*.jsonl"))
    if not files:
        return (0, None)
    total = 0
    for f in files:
        try:
            total += sum(1 for line in f.read_text(encoding="utf-8").splitlines() if line.strip())
        except OSError:
            continue
    return (total, files[-1].stem)


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------

def view_pipeline(apps: list[App], status_filter: str | None = None) -> list[tuple]:
    by_status: dict[str, list[App]] = defaultdict(list)
    for a in apps:
        by_status[a.status].append(a)
    order = ["new", "pending_review", "applied", "interviewing", "offer", "rejected", "withdrawn", "unknown"]
    rows: list[tuple] = []
    for s in order + [k for k in by_status if k not in order]:
        bucket = by_status.get(s, [])
        if status_filter and s != status_filter.lower():
            continue
        if not bucket:
            continue
        rows.append((s.upper(), len(bucket), bucket[0].company if bucket else ""))
    return rows


def view_today(apps: list[App], today: date) -> list[App]:
    """Apps that need action today: interviewing stage + no recent update, or applied > 7d."""
    out: list[App] = []
    for a in apps:
        age = a.age_days(today) or 0
        if a.status == "interviewing" and age > 5:
            out.append(a)
        elif a.status == "applied" and 7 <= age <= 14:
            out.append(a)
        elif a.status in ("new", "pending_review") and age > 2:
            out.append(a)
    out.sort(key=lambda x: x.age_days(today) or 0, reverse=True)
    return out[:20]


def view_decay(apps: list[App], today: date) -> list[App]:
    """Apps stalled >30 days in active status."""
    active = {"applied", "interviewing", "pending_review"}
    out: list[App] = []
    for a in apps:
        if a.status not in active:
            continue
        age = a.age_days(today)
        if age is not None and age >= 30:
            out.append(a)
    out.sort(key=lambda x: x.age_days(today) or 0, reverse=True)
    return out


def view_archetype_distribution(apps: list[App]) -> list[tuple[str, int]]:
    c = Counter(a.archetype for a in apps)
    return c.most_common()


# ---------------------------------------------------------------------------
# Printing
# ---------------------------------------------------------------------------

def _divider(title: str, width: int = 70) -> str:
    head = f" {title} "
    left = (width - len(head)) // 2
    return "=" * left + head + "=" * (width - left - len(head))


def print_dashboard(data: DashboardData, today: date, view: str | None = None, status_filter: str | None = None) -> None:
    views = [view] if view else ["pipeline", "today", "decay", "archetype", "staged"]

    print(_divider("job-applications dashboard"))
    print(f"  {len(data.apps)} applications on disk | as of {today.isoformat()}")

    if "pipeline" in views:
        print()
        print(_divider("Pipeline"))
        rows = view_pipeline(data.apps, status_filter)
        for status, n, sample in rows:
            print(f"  {status:<18} {n:>4}  (e.g., {sample[:30]})")

    if "today" in views:
        print()
        print(_divider("Needs action today"))
        today_apps = view_today(data.apps, today)
        if not today_apps:
            print("  nothing to action")
        for a in today_apps:
            age = a.age_days(today)
            print(f"  [{a.status[:6]:<6}] {a.company[:20]:<20} {a.role[:30]:<30} ({age}d)")

    if "decay" in views:
        print()
        print(_divider("Decay warnings (stalled > 30d)"))
        stale = view_decay(data.apps, today)
        if not stale:
            print("  no stalled applications")
        for a in stale[:15]:
            age = a.age_days(today)
            print(f"  [{a.status[:6]:<6}] {a.company[:20]:<20} {a.role[:30]:<30} ({age}d)")
        if len(stale) > 15:
            print(f"  ... and {len(stale) - 15} more")

    if "archetype" in views:
        print()
        print(_divider("Archetype distribution"))
        if classify_archetype is None:
            print("  (archetype classifier unavailable)")
        else:
            for archetype, n in view_archetype_distribution(data.apps):
                bar = "*" * min(n, 40)
                print(f"  {archetype:<24} {n:>4}  {bar}")

    if "staged" in views:
        print()
        print(_divider("Portal scan staged"))
        print(f"  {data.staged_count} postings discovered by portal_scan.py")
        if data.staged_latest:
            print(f"  latest batch: {data.staged_latest}")


def _json_payload(data: DashboardData, today: date) -> dict:
    return {
        "as_of": today.isoformat(),
        "total_apps": len(data.apps),
        "pipeline": [
            {"status": s, "count": n, "sample": sample}
            for s, n, sample in view_pipeline(data.apps)
        ],
        "today_apps": [asdict(a) for a in view_today(data.apps, today)],
        "decay": [asdict(a) for a in view_decay(data.apps, today)],
        "archetype_distribution": dict(view_archetype_distribution(data.apps)),
        "staged": {"count": data.staged_count, "latest": data.staged_latest},
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Offline job-applications dashboard")
    parser.add_argument("--view", choices=["pipeline", "today", "decay", "archetype", "staged"])
    parser.add_argument("--status", help="filter pipeline by status")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--date", help="override today's date (YYYY-MM-DD, for testing)")
    args = parser.parse_args(argv)

    today = (
        datetime.fromisoformat(args.date).date()
        if args.date
        else datetime.now(timezone.utc).date()
    )
    apps = load_apps()
    staged_count, staged_latest = load_staged()
    data = DashboardData(apps=apps, staged_count=staged_count, staged_latest=staged_latest)

    if args.json:
        print(json.dumps(_json_payload(data, today), indent=2, default=str))
    else:
        print_dashboard(data, today, view=args.view, status_filter=args.status)

    return 0


if __name__ == "__main__":
    sys.exit(main())
