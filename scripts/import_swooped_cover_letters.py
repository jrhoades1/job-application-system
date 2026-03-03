#!/usr/bin/env python3
"""Import Swooped cover letters into Supabase applications table.

Matches cover letters to applications by company + role name,
then updates the cover_letter column with the full text.
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
    """Normalize a string for fuzzy matching."""
    return s.lower().strip().replace(",", "").replace(".", "").replace("-", " ")


def similarity(a: str, b: str) -> float:
    """Fuzzy similarity between two strings."""
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def load_applications() -> list[dict]:
    """Load all applications from Supabase."""
    all_apps = []
    offset = 0
    limit = 500

    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/applications",
            headers=HEADERS,
            params={
                "clerk_user_id": f"eq.{CLERK_USER_ID}",
                "select": "id,company,role,cover_letter",
                "offset": offset,
                "limit": limit,
            },
        )
        if resp.status_code != 200:
            print(f"ERROR loading applications: {resp.status_code}")
            sys.exit(1)

        batch = resp.json()
        all_apps.extend(batch)
        if len(batch) < limit:
            break
        offset += limit

    return all_apps


def update_cover_letter(app_id: str, content: str) -> bool:
    """Update application's cover_letter column."""
    resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/applications",
        headers=HEADERS,
        params={"id": f"eq.{app_id}"},
        json={"cover_letter": content},
    )
    return resp.status_code in (200, 204)


def main():
    if not SUPABASE_KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY environment variable")
        sys.exit(1)

    if len(sys.argv) < 2:
        print("Usage: python import_swooped_cover_letters.py <swooped_cover_letters.json>")
        sys.exit(1)

    # Load Swooped data
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)

    letters = [cl for cl in data["coverLetters"] if cl.get("content")]
    print(f"Loaded {len(letters)} cover letters from Swooped export")

    # Load all Supabase applications
    apps = load_applications()
    print(f"Loaded {len(apps)} applications from Supabase\n")

    # Build lookup index: (normalized_company, normalized_role) -> app
    app_index: dict[tuple[str, str], dict] = {}
    for app in apps:
        key = (normalize(app["company"]), normalize(app["role"]))
        app_index[key] = app

    matched = 0
    fuzzy_matched = 0
    already_has = 0
    not_found = 0
    updated = 0

    for cl in letters:
        company = cl.get("company", "")
        role = cl.get("role", "")
        content = cl["content"]

        # Exact match
        key = (normalize(company), normalize(role))
        app = app_index.get(key)

        # Fuzzy match if exact fails
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
                else:
                    print(f"  NO MATCH: {company} | {role}".encode("ascii", "replace").decode())
                continue

        # Check if already has real content (not a filename ref)
        existing = app.get("cover_letter") or ""
        if len(existing) > 200:
            already_has += 1
            continue

        matched += 1

        if update_cover_letter(app["id"], content):
            updated += 1
            print(f"  Updated: {company} | {role} ({len(content)} chars)".encode("ascii", "replace").decode())
        else:
            print(f"  ERROR updating: {company} | {role}".encode("ascii", "replace").decode())

    print("\nDone!")
    print(f"  Matched: {matched} ({fuzzy_matched} fuzzy)")
    print(f"  Updated: {updated}")
    print(f"  Already had content: {already_has}")
    print(f"  Not found in Supabase: {not_found}")


if __name__ == "__main__":
    main()
