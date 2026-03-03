#!/usr/bin/env python3
"""Import Swooped job-optimized resumes into Supabase.

Matches resumes to applications by company + role name,
then updates the tailored_resume column.

Usage:
    python import_swooped_resumes.py <swooped_resumes.json>
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
                "select": "id,company,role,tailored_resume",
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


def update_resume(app_id: str, content: str) -> bool:
    resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/applications",
        headers=HEADERS,
        params={"id": f"eq.{app_id}"},
        json={"tailored_resume": content},
    )
    return resp.status_code in (200, 204)


def main():
    if not SUPABASE_KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY environment variable")
        sys.exit(1)

    if len(sys.argv) < 2:
        print("Usage: python import_swooped_resumes.py <swooped_resumes.json>")
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)

    resumes = [r for r in data.get("resumes", []) if r.get("content")]
    print(f"Loaded {len(resumes)} resumes with content from Swooped extract")

    apps = load_applications()
    print(f"Loaded {len(apps)} applications from Supabase\n")

    app_index: dict[tuple[str, str], dict] = {}
    for app in apps:
        key = (normalize(app["company"]), normalize(app["role"]))
        app_index[key] = app

    matched = 0
    fuzzy_matched = 0
    already_has = 0
    not_found = 0
    updated = 0

    for r in resumes:
        company = r.get("company", "")
        role = r.get("role", "")
        content = r["content"]

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

        existing = app.get("tailored_resume") or ""
        if len(existing) > 200:
            already_has += 1
            continue

        matched += 1

        if update_resume(app["id"], content):
            updated += 1
            print(f"  Updated: {company} | {role} ({len(content)} chars)".encode("ascii", "replace").decode())
        else:
            print(f"  ERROR: {company} | {role}".encode("ascii", "replace").decode())

    print("\nDone!")
    print(f"  Matched: {matched} ({fuzzy_matched} fuzzy)")
    print(f"  Updated: {updated}")
    print(f"  Already had resume: {already_has}")
    print(f"  Not found: {not_found}")


if __name__ == "__main__":
    main()
