#!/usr/bin/env python3
"""Migrate local cover-letter.md and resume.md content into Supabase.

Reads the actual markdown files from application folders and updates the
corresponding Supabase rows with the full text content.
"""

import json
import os
import sys
from pathlib import Path

import requests

SUPABASE_URL = "https://whlfknhcueovaelkisgp.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CLERK_USER_ID = "user_3AJg40z6I5NnXId0UlhPTeUC9Ub"
APPLICATIONS_DIR = Path(__file__).parent.parent / "applications"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def find_supabase_app(company: str, role: str) -> dict | None:
    """Find application in Supabase by company and role."""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/applications",
        headers=HEADERS,
        params={
            "clerk_user_id": f"eq.{CLERK_USER_ID}",
            "company": f"eq.{company}",
            "role": f"eq.{role}",
            "select": "id,company,role,cover_letter,tailored_resume",
        },
    )
    if resp.status_code == 200:
        data = resp.json()
        return data[0] if data else None
    return None


def update_application(app_id: str, updates: dict) -> bool:
    """Update application row in Supabase."""
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

    folders = sorted(APPLICATIONS_DIR.iterdir())
    folders = [f for f in folders if f.is_dir()]

    updated_cl = 0
    updated_resume = 0
    skipped = 0
    not_found = 0

    for folder in folders:
        meta_path = folder / "metadata.json"
        if not meta_path.exists():
            continue

        with open(meta_path, encoding="utf-8", errors="replace") as f:
            meta = json.load(f)

        company = meta.get("company", "")
        role = meta.get("role", "")

        cover_letter_path = folder / "cover-letter.md"
        resume_path = folder / "resume.md"

        has_cl = cover_letter_path.exists()
        has_resume = resume_path.exists()

        if not has_cl and not has_resume:
            continue

        print(f"  {company} — {role}")

        app = find_supabase_app(company, role)
        if not app:
            print("    NOT FOUND in Supabase, skipping")
            not_found += 1
            continue

        updates = {}

        if has_cl:
            content = cover_letter_path.read_text(encoding="utf-8", errors="replace")
            # Only update if current value is a filename ref or empty
            current = app.get("cover_letter") or ""
            if not current or len(current) < 200:
                updates["cover_letter"] = content
                print(f"    Cover letter: {len(content)} chars")

        if has_resume:
            content = resume_path.read_text(encoding="utf-8", errors="replace")
            current = app.get("tailored_resume") or ""
            if not current or len(current) < 200:
                updates["tailored_resume"] = content
                print(f"    Resume: {len(content)} chars")

        if not updates:
            print("    Already has content, skipping")
            skipped += 1
            continue

        if update_application(app["id"], updates):
            if "cover_letter" in updates:
                updated_cl += 1
            if "tailored_resume" in updates:
                updated_resume += 1
        else:
            print("    ERROR updating")

    print(f"\nDone! {updated_cl} cover letters, {updated_resume} resumes updated, "
          f"{skipped} skipped, {not_found} not found in Supabase")


if __name__ == "__main__":
    main()
