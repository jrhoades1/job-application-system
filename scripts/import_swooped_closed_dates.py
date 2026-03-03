#!/usr/bin/env python3
"""Import dates and statuses from Swooped closed jobs tab.

Updates applied_date and status for rejected/closed applications
that are missing this data.

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
    "Closed": "rejected",
    "Not Selected": "rejected",
    "Rejected": "rejected",
    "Withdrawn": "withdrawn",
}


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

    app_index: dict[tuple[str, str], dict] = {}
    for app in apps:
        key = (normalize(app["company"]), normalize(app["role"]))
        app_index[key] = app

    dates_filled = 0
    status_fixed = 0
    not_found = 0
    already_complete = 0

    for cj in closed_jobs:
        company = cj.get("company", "")
        role = cj.get("role", "")
        if not company or not role:
            continue

        key = (normalize(company), normalize(role))
        app = app_index.get(key)

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
            else:
                not_found += 1
                continue

        updates = {}

        # Fill in applied_date if missing
        applied_date = parse_date(cj.get("appliedDate")) or parse_date(cj.get("createdDate"))
        if applied_date and not app.get("applied_date"):
            updates["applied_date"] = applied_date

        # Fix status if needed
        swooped_status = cj.get("status", "Closed")
        expected = STATUS_MAP.get(swooped_status, "rejected")
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
