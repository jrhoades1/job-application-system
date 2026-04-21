"""
Portal Scan — Discover new job listings across ATS portals.

Complements `career_search.py` (which scrapes a known URL) by crawling
public ATS JSON feeds for NEW openings at a curated company list. Output
feeds the same pipeline staging pattern email_parse.py uses.

Usage:
    python portal_scan.py                       # scan all targets
    python portal_scan.py --since 7d             # only last 7 days
    python portal_scan.py --companies anthropic,stripe
    python portal_scan.py --dry-run              # print only, no stage write
    python portal_scan.py --json                 # machine-readable output

Feeds used (all public JSON, no Playwright):
    Greenhouse: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
    Ashby:      https://api.ashbyhq.com/posting-api/job-board/{slug}
    Lever:      https://api.lever.co/v0/postings/{slug}?mode=json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

try:
    import requests
except ImportError:
    print("ERROR: missing 'requests'. pip install requests", file=sys.stderr)
    sys.exit(2)

try:
    import yaml
except ImportError:
    yaml = None

REPO_ROOT = Path(__file__).resolve().parent
TARGETS_PATH = REPO_ROOT / "pipeline" / "portal_targets.yaml"
STAGE_DIR = REPO_ROOT / "pipeline" / "staging" / "discovered"
APPLICATIONS_DIR = REPO_ROOT / "applications"
# Lifetime history of every URL we've ever discovered. Dedup reads this so
# re-running a scan across days/weeks/months doesn't re-surface stale roles.
# Append-only, tab-separated: fingerprint, first_seen_iso, ats, company, url.
SCAN_HISTORY_PATH = REPO_ROOT / "pipeline" / "scan-history.tsv"

HTTP_HEADERS = {
    "User-Agent": "job-applications/portal_scan (+https://github.com/jimmyrhoades1/job-applications)",
    "Accept": "application/json",
}
HTTP_TIMEOUT = 30


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Posting:
    company: str
    ats: str
    title: str
    url: str
    location: str = ""
    updated_at: str | None = None  # ISO 8601
    external_id: str = ""
    archetype_hints: list[str] = field(default_factory=list)
    department: str = ""

    def fingerprint(self) -> str:
        """Stable dedup key: company + ATS + external_id."""
        basis = f"{self.company.lower()}|{self.ats}|{self.external_id}"
        return hashlib.sha1(basis.encode("utf-8")).hexdigest()[:16]


@dataclass
class ScanStats:
    companies_scanned: int = 0
    postings_found: int = 0
    postings_filtered: int = 0
    postings_duplicate: int = 0
    postings_staged: int = 0
    errors: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def load_config(path: Path = TARGETS_PATH) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"portal targets file missing: {path}")
    if yaml is None:
        raise RuntimeError("PyYAML required for portal_scan. pip install pyyaml")
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _compile_filters(cfg: dict) -> dict:
    f = cfg.get("filter", {})
    return {
        "max_age_days": int(f.get("max_age_days", 30)),
        "title_blocklist": [re.compile(p) for p in f.get("title_blocklist", [])],
        "title_allowlist": [re.compile(p) for p in f.get("title_allowlist", [])],
        "location_blocklist": [re.compile(p, re.IGNORECASE) for p in f.get("location_blocklist", [])],
    }


# ---------------------------------------------------------------------------
# ATS fetchers — each returns a list[Posting]
# ---------------------------------------------------------------------------

def fetch_greenhouse(slug: str) -> list[Posting]:
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
    resp = requests.get(url, headers=HTTP_HEADERS, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    postings: list[Posting] = []
    for j in data.get("jobs", []):
        postings.append(Posting(
            company=slug,
            ats="greenhouse",
            title=(j.get("title") or "").strip(),
            url=j.get("absolute_url", ""),
            location=(j.get("location") or {}).get("name", "") if isinstance(j.get("location"), dict) else "",
            updated_at=j.get("updated_at"),
            external_id=str(j.get("id", "")),
            department="",
        ))
    return postings


def fetch_ashby(slug: str) -> list[Posting]:
    url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
    resp = requests.get(url, headers=HTTP_HEADERS, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    postings: list[Posting] = []
    for j in data.get("jobs", []):
        postings.append(Posting(
            company=slug,
            ats="ashby",
            title=(j.get("title") or "").strip(),
            url=j.get("jobUrl", ""),
            location=j.get("locationName") or "",
            updated_at=j.get("publishedDate") or j.get("updatedAt"),
            external_id=j.get("id", ""),
            department=j.get("departmentName") or j.get("teamName") or "",
        ))
    return postings


def fetch_lever(slug: str) -> list[Posting]:
    url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
    resp = requests.get(url, headers=HTTP_HEADERS, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    postings: list[Posting] = []
    for j in data:
        created = j.get("createdAt")
        iso = None
        if isinstance(created, (int, float)):
            iso = datetime.fromtimestamp(created / 1000, tz=timezone.utc).isoformat()
        cats = j.get("categories") or {}
        postings.append(Posting(
            company=slug,
            ats="lever",
            title=(j.get("text") or "").strip(),
            url=j.get("hostedUrl", ""),
            location=cats.get("location", "") or "",
            updated_at=iso,
            external_id=j.get("id", ""),
            department=cats.get("department", "") or cats.get("team", ""),
        ))
    return postings


FETCHERS = {
    "greenhouse": fetch_greenhouse,
    "ashby": fetch_ashby,
    "lever": fetch_lever,
}


# ---------------------------------------------------------------------------
# Filtering + dedup
# ---------------------------------------------------------------------------

def _iso_to_dt(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None


def filter_posting(p: Posting, filters: dict, now: datetime) -> tuple[bool, str]:
    """Return (keep, reason_if_dropped)."""
    for rx in filters["title_blocklist"]:
        if rx.search(p.title):
            return (False, f"title_blocklist: {rx.pattern}")
    if filters["title_allowlist"]:
        if not any(rx.search(p.title) for rx in filters["title_allowlist"]):
            return (False, "title_allowlist miss")
    for rx in filters["location_blocklist"]:
        if rx.search(p.location or ""):
            return (False, f"location_blocklist: {rx.pattern}")

    max_age = filters["max_age_days"]
    if max_age and p.updated_at:
        updated = _iso_to_dt(p.updated_at)
        if updated:
            age = now - updated
            if age > timedelta(days=max_age):
                return (False, f"older than {max_age}d ({age.days}d)")
    return (True, "")


def load_known_urls() -> set[str]:
    """Read every applications/*/metadata.json — return their job URLs."""
    urls: set[str] = set()
    if not APPLICATIONS_DIR.exists():
        return urls
    for md in APPLICATIONS_DIR.glob("*/metadata.json"):
        try:
            data = json.loads(md.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        for key in ("job_url", "jd_url", "url", "career_url", "apply_url"):
            v = data.get(key)
            if v:
                urls.add(str(v).strip().rstrip("/"))
    return urls


def load_known_fingerprints() -> set[str]:
    """Previously-staged fingerprints across all discovered/*.jsonl files."""
    fps: set[str] = set()
    if not STAGE_DIR.exists():
        return fps
    for jsonl in STAGE_DIR.glob("*.jsonl"):
        try:
            for line in jsonl.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                obj = json.loads(line)
                fp = obj.get("fingerprint")
                if fp:
                    fps.add(fp)
        except (json.JSONDecodeError, OSError):
            continue
    return fps


def load_scan_history() -> set[str]:
    """Fingerprints from the lifetime scan history (scan-history.tsv).

    Survives stage-file rotation/cleanup. If someone purges discovered/*.jsonl,
    dedup still works against the lifetime ledger.
    """
    fps: set[str] = set()
    if not SCAN_HISTORY_PATH.exists():
        return fps
    try:
        for line in SCAN_HISTORY_PATH.read_text(encoding="utf-8").splitlines():
            if not line.strip() or line.startswith("#"):
                continue
            fp = line.split("\t", 1)[0]
            if fp:
                fps.add(fp)
    except OSError:
        pass
    return fps


def append_scan_history(postings: list[Posting]) -> int:
    """Append new rows to scan-history.tsv. Creates header on first write."""
    if not postings:
        return 0
    SCAN_HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing = load_scan_history()
    new_rows = [p for p in postings if p.fingerprint() not in existing]
    if not new_rows:
        return 0
    is_new_file = not SCAN_HISTORY_PATH.exists()
    now_iso = datetime.now(timezone.utc).isoformat()
    with SCAN_HISTORY_PATH.open("a", encoding="utf-8", newline="") as f:
        if is_new_file:
            f.write("# fingerprint\tfirst_seen_at\tats\tcompany\turl\n")
        for p in new_rows:
            f.write(f"{p.fingerprint()}\t{now_iso}\t{p.ats}\t{p.company}\t{p.url}\n")
    return len(new_rows)


def dedup(
    postings: Iterable[Posting],
    known_urls: set[str],
    known_fps: set[str],
) -> tuple[list[Posting], int]:
    unique: list[Posting] = []
    seen_in_batch: set[str] = set()
    dupes = 0
    for p in postings:
        fp = p.fingerprint()
        url_norm = (p.url or "").strip().rstrip("/")
        if fp in known_fps or (url_norm and url_norm in known_urls) or fp in seen_in_batch:
            dupes += 1
            continue
        seen_in_batch.add(fp)
        unique.append(p)
    return unique, dupes


# ---------------------------------------------------------------------------
# Staging
# ---------------------------------------------------------------------------

def stage_postings(postings: list[Posting], ts: str | None = None) -> Path:
    STAGE_DIR.mkdir(parents=True, exist_ok=True)
    if not ts:
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = STAGE_DIR / f"{ts}.jsonl"
    with out.open("w", encoding="utf-8") as f:
        for p in postings:
            payload = asdict(p)
            payload["fingerprint"] = p.fingerprint()
            payload["discovered_at"] = datetime.now(timezone.utc).isoformat()
            f.write(json.dumps(payload) + "\n")
    return out


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def scan(
    companies: list[str] | None = None,
    since_days: int | None = None,
    dry_run: bool = False,
    config_path: Path = TARGETS_PATH,
) -> tuple[list[Posting], ScanStats]:
    cfg = load_config(config_path)
    filters = _compile_filters(cfg)
    if since_days is not None:
        filters["max_age_days"] = since_days

    stats = ScanStats()
    all_postings: list[Posting] = []
    now = datetime.now(timezone.utc)

    targets = cfg.get("targets", [])
    if companies:
        wanted = {c.lower() for c in companies}
        targets = [t for t in targets if t["company"].lower() in wanted or t["slug"].lower() in wanted]

    for t in targets:
        ats = t.get("ats")
        slug = t.get("slug")
        hints = t.get("archetype_hints", [])
        if ats not in FETCHERS:
            stats.errors.append(f"{t['company']}: unknown ATS '{ats}'")
            continue
        try:
            postings = FETCHERS[ats](slug)
        except requests.exceptions.HTTPError as exc:
            stats.errors.append(f"{t['company']} ({ats}/{slug}): HTTP {exc.response.status_code}")
            continue
        except requests.exceptions.RequestException as exc:
            stats.errors.append(f"{t['company']} ({ats}/{slug}): {exc}")
            continue
        except ValueError as exc:
            stats.errors.append(f"{t['company']} ({ats}/{slug}): invalid JSON: {exc}")
            continue

        for p in postings:
            p.company = t["company"]
            p.archetype_hints = list(hints)

        stats.companies_scanned += 1
        stats.postings_found += len(postings)

        kept: list[Posting] = []
        for p in postings:
            ok, reason = filter_posting(p, filters, now)
            if not ok:
                stats.postings_filtered += 1
                continue
            kept.append(p)
        all_postings.extend(kept)
        time.sleep(0.5)  # be nice

    known_urls = load_known_urls()
    # Merge staged + lifetime history — either source evicts a duplicate.
    known_fps = load_known_fingerprints() | load_scan_history()
    unique, dupes = dedup(all_postings, known_urls, known_fps)
    stats.postings_duplicate = dupes

    if unique and not dry_run:
        stage_postings(unique)
        append_scan_history(unique)
        stats.postings_staged = len(unique)
    return unique, stats


def print_human(postings: list[Posting], stats: ScanStats) -> None:
    print("portal_scan")
    print("-" * 60)
    for p in postings[:20]:
        title = (p.title or "(untitled)")[:60]
        loc = (p.location or "")[:30]
        print(f"  [{p.ats[:4]}] {p.company:<16} {title:<60} {loc}")
    if len(postings) > 20:
        print(f"  ... and {len(postings) - 20} more")
    print("-" * 60)
    print(
        f"  {stats.companies_scanned} companies | "
        f"{stats.postings_found} found | "
        f"{stats.postings_filtered} filtered | "
        f"{stats.postings_duplicate} dup | "
        f"{stats.postings_staged} staged"
    )
    if stats.errors:
        print("  errors:")
        for e in stats.errors:
            print(f"    - {e}")


def _parse_since(s: str | None) -> int | None:
    if not s:
        return None
    m = re.match(r"^(\d+)([dwm]?)$", s.strip())
    if not m:
        raise argparse.ArgumentTypeError(f"invalid --since value: {s!r} (use 7d, 2w, 1m)")
    n = int(m.group(1))
    unit = m.group(2) or "d"
    return {"d": n, "w": n * 7, "m": n * 30}[unit]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scan ATS portals for new job listings")
    parser.add_argument("--since", type=str, help="max age (7d, 2w, 1m)")
    parser.add_argument("--companies", type=str, help="comma-separated subset")
    parser.add_argument("--dry-run", action="store_true", help="don't write to stage")
    parser.add_argument("--json", action="store_true", help="emit JSON")
    args = parser.parse_args(argv)

    companies = [c.strip() for c in args.companies.split(",")] if args.companies else None
    since_days = _parse_since(args.since)

    try:
        postings, stats = scan(companies=companies, since_days=since_days, dry_run=args.dry_run)
    except FileNotFoundError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps({
            "stats": asdict(stats),
            "postings": [asdict(p) for p in postings],
        }, indent=2))
    else:
        print_human(postings, stats)

    return 0 if not stats.errors else 1


if __name__ == "__main__":
    sys.exit(main())
