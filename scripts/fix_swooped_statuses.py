#!/usr/bin/env python3
"""Remediation: fix Swooped application statuses corrupted by import bugs.

Two bugs caused incorrect statuses:
1. The closed-jobs extraction script labeled everything as "Closed" regardless
   of the actual per-row status in rawText (e.g. "Applied" became "rejected")
2. The import script used (company, role) as a key, causing collisions when
   the same company/role appeared multiple times with different dates/statuses

This script uses both data sources to determine the correct status:
- swooped_data (active Track Jobs tab) — has correct statuses
- swooped_closed_jobs (Closed tab) — rawText has the real per-row status

Usage:
    python fix_swooped_statuses.py <swooped_data.json> <swooped_closed_jobs.json> [--dry-run]
"""

import json
import os
import re
import sys
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

RAW_TEXT_STATUSES = ["Applied", "Rejected", "Interviewing", "Offered", "Saved",
                     "Not Selected", "Withdrawn", "Closed"]


def normalize(s: str) -> str:
    return s.lower().strip().replace(",", "").replace(".", "").replace("-", " ")


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def parse_date(date_str: str) -> str | None:
    if not date_str:
        return None
    date_str = date_str.strip()
    match = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', date_str)
    if match:
        m, d, y = int(match.group(1)), int(match.group(2)), int(match.group(3))
        return f"{y:04d}-{m:02d}-{d:02d}"
    return None


def parse_raw_text_status(raw_text: str) -> str | None:
    for s in RAW_TEXT_STATUSES:
        if f"\n{s}\n" in raw_text or raw_text.strip().endswith(s):
            return s
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
                "select": "id,company,role,status,applied_date,source",
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


def update_application(app_id: str, updates: dict) -> bool:
    resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/applications",
        headers=HEADERS,
        params={"id": f"eq.{app_id}"},
        json=updates,
    )
    return resp.status_code in (200, 204)


def build_truth_table(swooped_data_path: str, closed_jobs_path: str) -> dict[tuple[str, str, str], str]:
    """Build (company, role, date) -> correct_swooped_status from both data sources.

    Active track data takes priority since it has accurate statuses.
    Closed jobs use rawText parsing for the real per-row status.
    """
    truth: dict[tuple[str, str, str], str] = {}

    # Source 1: Active Track Jobs (most reliable)
    with open(swooped_data_path, encoding="utf-8") as f:
        swooped_data = json.load(f)

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
        for s in RAW_TEXT_STATUSES:
            if any(s == line.strip() for line in lines):
                status = s
                break

        if tabs and len(tabs) >= 2 and status:
            company = normalize(tabs[0])
            role = normalize(tabs[1])
            date = parse_date(tabs[3]) if len(tabs) > 3 else (parse_date(tabs[2]) if len(tabs) > 2 else "")
            truth[(company, role, date or "")] = status

    active_count = len(truth)

    # Source 2: Closed Jobs (use rawText for real status)
    with open(closed_jobs_path, encoding="utf-8") as f:
        closed_data = json.load(f)

    for cj in closed_data.get("jobs", []):
        company = normalize(cj.get("company", ""))
        role = normalize(cj.get("role", ""))
        date = parse_date(cj.get("appliedDate")) or parse_date(cj.get("createdDate")) or ""

        # Parse real status from rawText
        raw_text = cj.get("rawText", "")
        real_status = parse_raw_text_status(raw_text)

        if not real_status:
            # If we can't parse rawText, skip — don't trust the "Closed" label
            continue

        key = (company, role, date)
        # Don't overwrite active track data (it's more reliable)
        if key not in truth:
            truth[key] = real_status

    closed_count = len(truth) - active_count
    print(f"  Truth table: {active_count} from active track, {closed_count} from closed tab rawText")
    return truth


def main():
    if not SUPABASE_KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY environment variable")
        sys.exit(1)

    if len(sys.argv) < 3:
        print("Usage: python fix_swooped_statuses.py <swooped_data.json> <swooped_closed_jobs.json> [--dry-run]")
        sys.exit(1)

    dry_run = "--dry-run" in sys.argv

    print("=" * 60)
    print("  SWOOPED STATUS REMEDIATION")
    print("=" * 60)
    if dry_run:
        print("  *** DRY RUN — no changes will be made ***\n")

    # Build truth table from both Swooped data sources
    truth = build_truth_table(sys.argv[1], sys.argv[2])

    # Load all applications
    apps = load_applications()
    swooped_apps = [a for a in apps if a.get("source") == "Swooped"]
    print(f"  Total applications: {len(apps)}")
    print(f"  Swooped applications: {len(swooped_apps)}\n")

    # Match each Swooped app against truth table
    fixed = 0
    already_correct = 0
    not_found = 0
    errors = 0

    for app in swooped_apps:
        company = normalize(app["company"])
        role = normalize(app["role"])
        date = (app.get("applied_date") or "")[:10]

        # Try exact match with date
        key = (company, role, date)
        swooped_status = truth.get(key)

        # Fallback: try without date but only if there's exactly one match
        if not swooped_status:
            matching_keys = [k for k in truth if k[0] == company and k[1] == role]
            if len(matching_keys) == 1:
                swooped_status = truth[matching_keys[0]]
            elif len(matching_keys) > 1:
                # Multiple matches — try fuzzy date matching
                for mk in matching_keys:
                    if mk[2] == date:
                        swooped_status = truth[mk]
                        break

        if not swooped_status:
            not_found += 1
            continue

        expected_status = STATUS_MAP.get(swooped_status, "applied")
        current_status = app["status"]

        if current_status == expected_status:
            already_correct += 1
            continue

        # Don't override manually-advanced statuses (interviewing, offered, accepted)
        # UNLESS current is "rejected" — that's the bug we're fixing
        skip_statuses = {"interviewing", "offered", "accepted", "withdrawn"}
        if current_status in skip_statuses and current_status != "rejected":
            already_correct += 1
            continue

        action = "DRY RUN" if dry_run else "FIXING"
        print(f"  [{action}] {app['company']} | {app['role']} | {app.get('applied_date', 'no-date')}: "
              f"{current_status} -> {expected_status}".encode("ascii", "replace").decode())

        if not dry_run:
            if update_application(app["id"], {"status": expected_status}):
                fixed += 1
            else:
                print(f"    ERROR updating {app['id']}")
                errors += 1
        else:
            fixed += 1

    print(f"\n{'=' * 60}")
    print("  RESULTS")
    print(f"{'=' * 60}")
    print(f"  {'Would fix' if dry_run else 'Fixed'}: {fixed}")
    print(f"  Already correct: {already_correct}")
    print(f"  Not in Swooped data: {not_found}")
    if errors:
        print(f"  Errors: {errors}")


if __name__ == "__main__":
    main()
