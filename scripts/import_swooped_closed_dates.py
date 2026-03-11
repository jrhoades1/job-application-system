#!/usr/bin/env python3
"""Import dates and statuses from Swooped closed jobs tab.

Updates applied_date and status for rejected/closed applications
that are missing this data.

IMPORTANT: The Closed tab labels every entry as "Closed", but the rawText
field contains the actual per-row status (e.g. "Applied", "Interviewing").
We parse rawText to get the real status.

Usage:
    python import_swooped_closed_dates.py <swooped_closed_jobs.json>
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
    "Applied": "applied",
    "Interviewing": "interviewing",
    "Offered": "offered",
    "Saved": "evaluating",
    "Closed": "rejected",
    "Not Selected": "rejected",
    "Rejected": "rejected",
    "Withdrawn": "withdrawn",
}

# Statuses that appear in Swooped rawText (the actual per-row status)
RAW_TEXT_STATUSES = ["Applied", "Rejected", "Interviewing", "Offered", "Saved",
                     "Not Selected", "Withdrawn", "Closed"]


def parse_raw_text_status(raw_text: str) -> str | None:
    """Extract the actual application status from a Swooped rawText field.

    The Closed tab labels everything as 'Closed', but the rawText contains
    the real per-row status (e.g. 'Applied', 'Interviewing').
    """
    for s in RAW_TEXT_STATUSES:
        if f"\n{s}\n" in raw_text or raw_text.strip().endswith(s):
            return s
    return None


def normalize(s: str) -> str:
    return s.lower().strip().replace(",", "").replace(".", "").replace("-", " ")


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def parse_date(date_str: str) -> str | None:
    if not date_str:
        return None
    match = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', date_str.strip())
    if match:
        m, d, y = int(match.group(1)), int(match.group(2)), int(match.group(3))
        return f"{y:04d}-{m:02d}-{d:02d}"
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
            print(f"ERROR: {resp.status_code}")
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


def main():
    if not SUPABASE_KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY environment variable")
        sys.exit(1)

    if len(sys.argv) < 2:
        print("Usage: python import_swooped_closed_dates.py <swooped_closed_jobs.json>")
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)

    closed_jobs = data.get("jobs", [])
    print(f"Loaded {len(closed_jobs)} closed jobs from Swooped extract")
    print(f"Status breakdown: {data.get('statusBreakdown', {})}")

    apps = load_applications()
    print(f"Loaded {len(apps)} applications from Supabase\n")

    # Use (company, role, date) as primary key to avoid collisions
    app_index: dict[tuple[str, str, str], dict] = {}
    app_index_no_date: dict[tuple[str, str], list[dict]] = {}
    for app in apps:
        date_key = (app.get("applied_date") or "")[:10]
        key = (normalize(app["company"]), normalize(app["role"]), date_key)
        app_index[key] = app
        no_date_key = (normalize(app["company"]), normalize(app["role"]))
        app_index_no_date.setdefault(no_date_key, []).append(app)

    dates_filled = 0
    status_fixed = 0
    not_found = 0
    already_complete = 0

    for cj in closed_jobs:
        company = cj.get("company", "")
        role = cj.get("role", "")
        if not company or not role:
            continue

        # Parse the REAL status from rawText, not the tab-level "Closed" label
        raw_text = cj.get("rawText", "")
        real_status = parse_raw_text_status(raw_text) or cj.get("status", "Closed")

        applied_date = parse_date(cj.get("appliedDate")) or parse_date(cj.get("createdDate"))
        date_key = applied_date or ""

        # Try exact match with date first
        key = (normalize(company), normalize(role), date_key)
        app = app_index.get(key)

        # Fallback: match without date but only if there's exactly one match
        if not app:
            no_date_key = (normalize(company), normalize(role))
            candidates = app_index_no_date.get(no_date_key, [])
            if len(candidates) == 1:
                app = candidates[0]
            elif len(candidates) > 1:
                # Multiple matches — try to find one with matching date
                for c in candidates:
                    if (c.get("applied_date") or "")[:10] == date_key:
                        app = c
                        break

        # Last resort: fuzzy match (only if no collisions)
        if not app:
            best_score = 0
            best_apps = []
            for a in apps:
                score = (similarity(company, a["company"]) + similarity(role, a["role"])) / 2
                if score > best_score:
                    best_score = score
                    best_apps = [a]
                elif score == best_score:
                    best_apps.append(a)
            if best_score >= 0.75 and len(best_apps) == 1:
                app = best_apps[0]
            else:
                not_found += 1
                continue

        updates = {}

        # Fill in applied_date if missing
        if applied_date and not app.get("applied_date"):
            updates["applied_date"] = applied_date

        # Fix status using the REAL status from rawText
        expected = STATUS_MAP.get(real_status, "applied")
        if app.get("status") != expected and app.get("status") not in ("withdrawn", "offered", "interviewing"):
            updates["status"] = expected

        if not updates:
            already_complete += 1
            continue

        if update_application(app["id"], updates):
            if "applied_date" in updates:
                dates_filled += 1
            if "status" in updates:
                status_fixed += 1
            print(f"  Updated: {company} | {role} | {updates}".encode("ascii", "replace").decode())
        else:
            print(f"  ERROR: {company} | {role}".encode("ascii", "replace").decode())

    print("\nDone!")
    print(f"  Dates filled: {dates_filled}")
    print(f"  Statuses fixed: {status_fixed}")
    print(f"  Already complete: {already_complete}")
    print(f"  Not found: {not_found}")


if __name__ == "__main__":
    main()
