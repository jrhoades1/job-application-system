#!/usr/bin/env python3
"""Import Swooped v5 resumes (missing company/role metadata) into Supabase.

v5 extractions have company='Swooped', role='View Resume' because the page
title is generic. This script parses the resume headline from content and
fuzzy-matches against Supabase applications.

Usage:
    python import_swooped_resumes_v5.py <swooped_resumes_v5_file.json>
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

GENERIC_COMPANY = {"swooped", "view resume", ""}


def normalize(s: str) -> str:
    return s.lower().strip().replace(",", "").replace(".", "").replace("-", " ")


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def extract_headline_from_content(content: str) -> str:
    """
    Extract the role headline from resume content.
    Format is:
        Jimmy Rhoades
        <contact info line>
        <linkedin line>
        <HEADLINE>
    Returns the headline (all-caps role title) or empty string.
    """
    lines = [ln.strip() for ln in content.splitlines() if ln.strip()]
    # Skip name, contact info, linkedin — find first all-caps or title line
    # that looks like a role (not contact info)
    skip_patterns = [
        r"jimmy rhoades",
        r"\d{3}[\.\-]\d{3}",  # phone
        r"@gmail\.com",
        r"linkedin\.com",
        r"west palm beach",
    ]
    for line in lines[:15]:
        lower = line.lower()
        if any(re.search(p, lower) for p in skip_patterns):
            continue
        # Must be >5 chars and look like a title (not a bullet point or date)
        if len(line) > 5 and not line.startswith("•") and not re.match(r"^\d", line):
            return line
    return ""


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
            print(f"ERROR loading apps: {resp.status_code} {resp.text}")
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
        print("Usage: python import_swooped_resumes_v5.py <swooped_resumes_v5_file.json>")
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)

    # Only process resumes with content and generic/missing company metadata
    all_resumes = data.get("resumes", [])
    resumes = [
        r for r in all_resumes
        if r.get("content")
        and normalize(r.get("company", "")) in GENERIC_COMPANY
    ]
    print(f"Loaded {len(all_resumes)} resumes total, {len(resumes)} with generic metadata to process")

    apps = load_applications()
    print(f"Loaded {len(apps)} applications from Supabase\n")

    # Index apps by role (normalized) for headline matching
    apps_by_role: dict[str, list[dict]] = {}
    for app in apps:
        key = normalize(app.get("role", ""))
        apps_by_role.setdefault(key, []).append(app)

    matched = 0
    already_has = 0
    not_found = 0
    updated = 0
    no_headline = 0

    for r in resumes:
        content = r["content"]
        headline = extract_headline_from_content(content)

        if not headline:
            no_headline += 1
            print(f"  NO HEADLINE: uuid={r['uuid'][:8]}")
            continue

        # Try to match headline against application roles
        best_score = 0.0
        best_app = None
        for app in apps:
            score = similarity(headline, app.get("role", ""))
            if score > best_score:
                best_score = score
                best_app = app

        if best_score < 0.6:
            not_found += 1
            if best_app:
                msg = f"  NO MATCH (score={best_score:.2f}): '{headline}' best='{best_app['role']}' @ {best_app['company']}"
                print(msg.encode("ascii", "replace").decode())
            continue

        app = best_app
        existing = app.get("tailored_resume") or ""
        if len(existing) > 200:
            already_has += 1
            continue

        matched += 1
        if update_resume(app["id"], content):
            updated += 1
            msg = f"  Updated (score={best_score:.2f}): '{headline}' -> {app['company']} | {app['role']} ({len(content)} chars)"
            print(msg.encode("ascii", "replace").decode())
        else:
            msg = f"  ERROR: '{headline}' -> {app['company']} | {app['role']}"
            print(msg.encode("ascii", "replace").decode())

    print("\nDone!")
    print(f"  No headline extracted: {no_headline}")
    print(f"  Matched: {matched}")
    print(f"  Updated: {updated}")
    print(f"  Already had resume: {already_has}")
    print(f"  Not found (score < 0.6): {not_found}")


if __name__ == "__main__":
    main()
