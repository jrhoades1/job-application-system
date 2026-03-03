#!/usr/bin/env python3
"""Import missing Swooped jobs into Supabase and correct statuses.

The original Swooped extract only captured the active "Track Jobs" tab (303 jobs).
The cover letter extract has 587 entries — meaning ~207 closed/rejected jobs
were never imported. This script:

1. Creates Supabase records for jobs that exist in Swooped but not in Supabase
2. Imports their cover letter content at the same time
3. Verifies statuses for existing records

Usage:
    python import_missing_swooped_jobs.py <swooped_cover_letters.json> <swooped_data.json>
"""

import json
import os
import re
import sys
from datetime import datetime
from difflib import SequenceMatcher

import requests

SUPABASE_URL = "https://whlfknhcueovaelkisgp.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CLERK_USER_ID = "user_3AJg40z6I5NnXId0UlhPTeUC9Ub"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def normalize(s: str) -> str:
    return s.lower().strip().replace(",", "").replace(".", "").replace("-", " ")


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def parse_date(date_str: str) -> str | None:
    if not date_str:
        return None
    date_str = date_str.strip()
    # M/D/YYYY
    match = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', date_str)
    if match:
        m, d, y = int(match.group(1)), int(match.group(2)), int(match.group(3))
        return f"{y:04d}-{m:02d}-{d:02d}"
    # "Feb 12, 2026"
    for fmt in ['%b %d, %Y', '%b %d %Y', '%B %d, %Y', '%B %d %Y']:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None


def load_applications() -> list[dict]:
    all_apps = []
    offset = 0
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/applications",
            headers=HEADERS,
            params={
                "clerk_user_id": f"eq.{CLERK_USER_ID}",
                "select": "id,company,role,status,cover_letter,tailored_resume,applied_date,source",
                "offset": offset,
                "limit": 500,
            },
        )
        if resp.status_code != 200:
            print(f"ERROR loading applications: {resp.status_code}")
            sys.exit(1)
        batch = resp.json()
        all_apps.extend(batch)
        if len(batch) < 500:
            break
        offset += 500
    return all_apps


def create_application(company: str, role: str, status: str, applied_date: str | None,
                       cover_letter: str | None) -> dict | None:
    """Create a new application in Supabase."""
    payload = {
        "clerk_user_id": CLERK_USER_ID,
        "company": company,
        "role": role,
        "status": status,
        "source": "Swooped",
        "applied_date": applied_date,
        "cover_letter": cover_letter,
        "notes": f"Imported from Swooped.ai closed/rejected tab on {datetime.now().strftime('%Y-%m-%d')}.",
    }
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/applications",
        headers=HEADERS,
        json=payload,
    )
    if resp.status_code in (200, 201):
        result = resp.json()
        return result[0] if isinstance(result, list) else result
    else:
        print(f"  ERROR creating: {resp.status_code} {resp.text[:200]}")
        return None


def update_application(app_id: str, updates: dict) -> bool:
    resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/applications",
        headers=HEADERS,
        params={"id": f"eq.{app_id}"},
        json=updates,
    )
    return resp.status_code in (200, 204)


def build_date_lookup(swooped_data: dict) -> dict:
    """Parse cover letter creation dates from the raw text."""
    cl_raw = swooped_data.get("coverLetters", {}).get("raw", "")
    pattern = re.compile(
        r'"([^"]+)"\s+at\s+"([^"]+)"\s*\n\s*\n\s*Base Resume\s*\n\s*\n\s*Created on\s+([A-Za-z]+ \d+,? \d{4})'
    )
    lookup = {}
    for role, company, date_str in pattern.findall(cl_raw):
        key = (normalize(company), normalize(role))
        d = parse_date(date_str)
        if d:
            lookup[key] = d
    return lookup


def build_track_date_lookup(swooped_data: dict) -> dict:
    """Parse applied dates from the Track Jobs structured data."""
    lookup = {}
    structured = swooped_data.get("trackJobs", {}).get("structured", [])
    for item in structured:
        text = item.get("text", "")
        lines = text.split("\n")
        tabs = None
        for line in lines:
            parts = line.split("\t")
            cleaned = [p.strip() for p in parts if p.strip()]
            if len(cleaned) >= 2:
                tabs = cleaned
                break
        if tabs and len(tabs) >= 2:
            company = tabs[0]
            role = tabs[1]
            key = (normalize(company), normalize(role))
            applied = parse_date(tabs[3]) if len(tabs) > 3 else None
            created = parse_date(tabs[2]) if len(tabs) > 2 else None
            lookup[key] = {"applied": applied, "created": created}
    return lookup


def build_swooped_status_lookup(swooped_data: dict) -> dict:
    """Parse statuses from the Track Jobs structured data."""
    lookup = {}
    structured = swooped_data.get("trackJobs", {}).get("structured", [])
    for item in structured:
        text = item.get("text", "")
        lines = text.split("\n")
        tabs = None
        for line in lines:
            parts = line.split("\t")
            cleaned = [p.strip() for p in parts if p.strip()]
            if len(cleaned) >= 2:
                tabs = cleaned
                break
        status = None
        for s in ["Saved", "Applied", "Interviewing", "Offered", "Rejected",
                   "Closed", "Not Selected", "Withdrawn"]:
            if any(s == line.strip() for line in lines):
                status = s
                break
        if tabs and len(tabs) >= 2 and status:
            key = (normalize(tabs[0]), normalize(tabs[1]))
            lookup[key] = status
    return lookup


STATUS_MAP = {
    "Saved": "evaluating",
    "Applied": "applied",
    "Interviewing": "interviewing",
    "Offered": "offered",
    "Closed": "rejected",
    "Not Selected": "rejected",
    "Rejected": "rejected",
    "Withdrawn": "withdrawn",
}


def main():
    if not SUPABASE_KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY environment variable")
        sys.exit(1)

    if len(sys.argv) < 3:
        print("Usage: python import_missing_swooped_jobs.py <swooped_cover_letters.json> <swooped_data.json>")
        sys.exit(1)

    cl_path = sys.argv[1]
    data_path = sys.argv[2]

    print("=" * 60)
    print("  SWOOPED MISSING JOBS IMPORTER + STATUS FIXER")
    print("=" * 60)

    # Load cover letters extract (has all 587 jobs with content)
    with open(cl_path, encoding="utf-8") as f:
        cl_data = json.load(f)
    letters = cl_data.get("coverLetters", [])
    print(f"\n  Cover letters loaded: {len(letters)}")

    # Load main Swooped data (has dates and statuses for active jobs)
    with open(data_path, encoding="utf-8") as f:
        swooped_data = json.load(f)

    # Build lookups
    cl_date_lookup = build_date_lookup(swooped_data)
    track_date_lookup = build_track_date_lookup(swooped_data)
    swooped_status_lookup = build_swooped_status_lookup(swooped_data)
    print(f"  Cover letter dates: {len(cl_date_lookup)}")
    print(f"  Track dates: {len(track_date_lookup)}")
    print(f"  Swooped statuses: {len(swooped_status_lookup)}")

    # Load Supabase applications
    apps = load_applications()
    print(f"  Supabase applications: {len(apps)}")

    # Build index
    app_index: dict[tuple[str, str], dict] = {}
    for app in apps:
        key = (normalize(app["company"]), normalize(app["role"]))
        app_index[key] = app

    # ============================================================
    # PART 1: Find and create missing jobs
    # ============================================================
    print(f"\n{'=' * 60}")
    print("  PART 1: Import missing jobs")
    print(f"{'=' * 60}\n")

    created = 0
    already_exists = 0
    create_errors = 0

    for cl in letters:
        company = cl.get("company", "")
        role = cl.get("role", "")
        if not company or not role:
            continue

        key = (normalize(company), normalize(role))

        # Check exact match
        if key in app_index:
            already_exists += 1
            continue

        # Check fuzzy match
        best_score = 0
        for (ac, ar), a in app_index.items():
            score = (similarity(company, a["company"]) + similarity(role, a["role"])) / 2
            if score > best_score:
                best_score = score

        if best_score >= 0.75:
            already_exists += 1
            continue

        # This job is MISSING from Supabase — create it
        # Get date: try cover letter creation date, fallback to None
        applied_date = cl_date_lookup.get(key)
        if not applied_date:
            # Try fuzzy date lookup
            for (dc, dr), d in cl_date_lookup.items():
                if similarity(company.lower(), dc) > 0.85 and similarity(role.lower(), dr) > 0.85:
                    applied_date = d
                    break

        content = cl.get("content")

        result = create_application(
            company=company,
            role=role,
            status="rejected",  # These are from the closed tab
            applied_date=applied_date,
            cover_letter=content,
        )

        if result:
            created += 1
            # Add to index so we don't create duplicates
            app_index[key] = result
            print(f"  Created: {company} | {role} | date={applied_date or 'unknown'} | CL={len(content or '')} chars".encode("ascii", "replace").decode())
        else:
            create_errors += 1

    print(f"\n  Summary: {created} created, {already_exists} already existed, {create_errors} errors")

    # ============================================================
    # PART 2: Fix statuses for existing Swooped jobs
    # ============================================================
    print(f"\n{'=' * 60}")
    print("  PART 2: Verify and fix statuses")
    print(f"{'=' * 60}\n")

    # Reload apps to include newly created ones
    apps = load_applications()
    _ = {a["id"]: a for a in apps}  # available for debugging

    # Rebuild normalized index
    app_index = {}
    for app in apps:
        key = (normalize(app["company"]), normalize(app["role"]))
        app_index[key] = app

    status_fixed = 0
    status_ok = 0
    status_no_swooped = 0

    for app in apps:
        if app.get("source") != "Swooped":
            continue

        key = (normalize(app["company"]), normalize(app["role"]))
        swooped_status = swooped_status_lookup.get(key)

        if not swooped_status:
            # This job isn't in the active track — it's from the closed tab
            # If we just created it, it should already be "rejected"
            if app["status"] == "rejected":
                status_ok += 1
            else:
                status_no_swooped += 1
            continue

        expected_status = STATUS_MAP.get(swooped_status, "evaluating")
        current_status = app["status"]

        if current_status == expected_status:
            status_ok += 1
            continue

        # Status mismatch — fix it
        # But don't downgrade: if Supabase has a more advanced status, keep it
        # Priority: rejected > withdrawn > offered > interviewing > applied > evaluating > pending_review > ready_to_apply
        priority = {
            "ready_to_apply": 0, "pending_review": 1, "evaluating": 2,
            "applied": 3, "interviewing": 4, "offered": 5,
            "withdrawn": 6, "rejected": 7,
        }

        current_pri = priority.get(current_status, 0)
        expected_pri = priority.get(expected_status, 0)

        if expected_pri > current_pri:
            # Swooped has a more advanced status — update
            if update_application(app["id"], {"status": expected_status}):
                status_fixed += 1
                print(f"  Fixed: {app['company']} | {app['role']}: {current_status} -> {expected_status}".encode("ascii", "replace").decode())
            else:
                print(f"  ERROR fixing: {app['company']} | {app['role']}".encode("ascii", "replace").decode())
        else:
            status_ok += 1

    # Also fix dates for tracked jobs that have them
    date_fixed = 0
    for app in apps:
        if app.get("source") != "Swooped":
            continue
        if app.get("applied_date"):
            continue  # Already has a date

        key = (normalize(app["company"]), normalize(app["role"]))
        track_info = track_date_lookup.get(key)
        if track_info:
            applied_date = track_info.get("applied") or track_info.get("created")
            if applied_date:
                if update_application(app["id"], {"applied_date": applied_date}):
                    date_fixed += 1

    print(f"\n  Statuses: {status_fixed} fixed, {status_ok} already correct, {status_no_swooped} not in active Swooped tab")
    print(f"  Dates: {date_fixed} applied_dates filled in")

    # ============================================================
    # PART 3: Also import cover letters for existing jobs that are missing them
    # ============================================================
    print(f"\n{'=' * 60}")
    print("  PART 3: Fill in missing cover letters for existing jobs")
    print(f"{'=' * 60}\n")

    cl_filled = 0
    cl_already = 0

    for cl in letters:
        company = cl.get("company", "")
        role = cl.get("role", "")
        content = cl.get("content")
        if not company or not role or not content:
            continue

        key = (normalize(company), normalize(role))
        app = app_index.get(key)

        # Try fuzzy match
        if not app:
            best_score = 0
            best_app = None
            for (ac, ar), a in app_index.items():
                score = (similarity(company, a["company"]) + similarity(role, a["role"])) / 2
                if score > best_score:
                    best_score = score
                    best_app = a
            if best_score >= 0.75:
                app = best_app

        if not app:
            continue

        existing = app.get("cover_letter") or ""
        if len(existing) > 200:
            cl_already += 1
            continue

        if update_application(app["id"], {"cover_letter": content}):
            cl_filled += 1

    print(f"  Cover letters: {cl_filled} filled in, {cl_already} already had content")

    # ============================================================
    # Final summary
    # ============================================================
    print(f"\n{'=' * 60}")
    print("  FINAL SUMMARY")
    print(f"{'=' * 60}")

    # Reload and count
    final_apps = load_applications()
    from collections import Counter
    statuses = Counter(a["status"] for a in final_apps)
    swooped_count = sum(1 for a in final_apps if a.get("source") == "Swooped")
    has_cl = sum(1 for a in final_apps if a.get("cover_letter") and len(a["cover_letter"]) > 200)
    has_resume = sum(1 for a in final_apps if a.get("tailored_resume") and len(a["tailored_resume"]) > 200)

    print(f"\n  Total applications: {len(final_apps)} (was {len(apps)} before)")
    print(f"  From Swooped: {swooped_count}")
    print(f"  With cover letters: {has_cl}")
    print(f"  With tailored resumes: {has_resume}")
    print("\n  Status breakdown:")
    for s, c in statuses.most_common():
        print(f"    {s}: {c}")
    print()


if __name__ == "__main__":
    main()
