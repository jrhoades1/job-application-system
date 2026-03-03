#!/usr/bin/env python3
"""Import Swooped job descriptions into Supabase.

Matches JDs to applications by company + role name,
then updates the job_description column.

Usage:
    python import_swooped_job_descriptions.py <swooped_job_descriptions.json>
"""

import json
import os
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


def normalize(s: str) -> str:
    return s.lower().strip().replace(",", "").replace(".", "").replace("-", " ")


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def load_applications() -> list[dict]:
    all_apps = []
    offset = 0
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/applications",
            headers=HEADERS,
            params={
                "clerk_user_id": f"eq.{CLERK_USER_ID}",
                "select": "id,company,role,job_description,location,compensation",
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


def main():
    if not SUPABASE_KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY environment variable")
        sys.exit(1)

    if len(sys.argv) < 2:
        print("Usage: python import_swooped_job_descriptions.py <swooped_job_descriptions.json>")
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)

    jds = [j for j in data.get("jobDescriptions", []) if j.get("jobDescription")]
    print(f"Loaded {len(jds)} job descriptions from Swooped extract")

    apps = load_applications()
    print(f"Loaded {len(apps)} applications from Supabase\n")

    # Build index
    app_index: dict[tuple[str, str], dict] = {}
    for app in apps:
        key = (normalize(app["company"]), normalize(app["role"]))
        app_index[key] = app

    matched = 0
    fuzzy_matched = 0
    already_has = 0
    not_found = 0
    updated = 0
    meta_updated = 0

    for jd in jds:
        company = jd.get("company", "")
        role = jd.get("role", "")
        content = jd["jobDescription"]
        metadata = jd.get("metadata") or {}

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
                fuzzy_matched += 1
            else:
                not_found += 1
                if best_app:
                    print(f"  NO MATCH: {company} | {role} (best: {best_app['company']} | {best_app['role']} @ {best_score:.2f})".encode("ascii", "replace").decode())
                continue

        # Check if already has a real JD
        existing = app.get("job_description") or ""
        if len(existing) > 200:
            already_has += 1
            continue

        matched += 1

        # Build updates
        updates = {"job_description": content}

        # Also update location and compensation if available and currently empty
        if metadata.get("location") and not app.get("location"):
            updates["location"] = metadata["location"]
        if metadata.get("salary") and not app.get("compensation"):
            updates["compensation"] = metadata["salary"]

        if update_application(app["id"], updates):
            updated += 1
            extras = []
            if "location" in updates:
                extras.append(f"loc={updates['location'][:30]}")
            if "compensation" in updates:
                extras.append(f"comp={updates['compensation']}")
            extra_str = f" | {', '.join(extras)}" if extras else ""
            print(f"  Updated: {company} | {role} ({len(content)} chars){extra_str}".encode("ascii", "replace").decode())

            if "location" in updates or "compensation" in updates:
                meta_updated += 1
        else:
            print(f"  ERROR updating: {company} | {role}".encode("ascii", "replace").decode())

    print("\nDone!")
    print(f"  Matched: {matched} ({fuzzy_matched} fuzzy)")
    print(f"  Updated: {updated}")
    print(f"  Already had JD: {already_has}")
    print(f"  Not found in Supabase: {not_found}")
    print(f"  Also updated location/comp: {meta_updated}")


if __name__ == "__main__":
    main()
