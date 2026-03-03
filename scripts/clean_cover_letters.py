#!/usr/bin/env python3
"""Clean cover letters in Supabase — remove Swooped UI text and fix whitespace."""

import os
import re
import sys

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

UI_STRINGS = [
    "Regenerate with Feedback",
    "Open options",
    "Want a shorter, results focused cover letter?",
    "We can also generate a more modern style with bullet points and metrics.",
    "Keep Current",
    "Try It",
]


def clean_cover_letter(cl: str) -> str:
    # Remove known UI strings
    for ui in UI_STRINGS:
        cl = cl.replace(ui, "")

    # Collapse 3+ newlines to 2
    cl = re.sub(r"\n{3,}", "\n\n", cl)

    # Strip leading/trailing whitespace
    cl = cl.strip()

    return cl


def main():
    if not SUPABASE_KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    all_apps = []
    offset = 0
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/applications",
            headers=HEADERS,
            params={
                "clerk_user_id": f"eq.{CLERK_USER_ID}",
                "cover_letter": "not.is.null",
                "select": "id,company,role,cover_letter",
                "offset": offset,
                "limit": 500,
            },
        )
        batch = resp.json()
        all_apps.extend(batch)
        if len(batch) < 500:
            break
        offset += 500

    print(f"Total with cover letters: {len(all_apps)}")

    cleaned = 0
    for app in all_apps:
        cl = app.get("cover_letter", "")
        if not cl or len(cl) < 100:
            continue

        new_cl = clean_cover_letter(cl)
        if new_cl == cl:
            continue

        resp = requests.patch(
            f"{SUPABASE_URL}/rest/v1/applications",
            headers=HEADERS,
            params={"id": f"eq.{app['id']}"},
            json={"cover_letter": new_cl},
        )
        if resp.status_code in (200, 204):
            cleaned += 1
            print(f"  Cleaned: {app['company']} | {app['role']}".encode("ascii", "replace").decode(), flush=True)

    print(f"\nDone! Cleaned {cleaned} cover letters")


if __name__ == "__main__":
    main()
