#!/usr/bin/env python3
"""Audit which applications are missing tailored_resume in Supabase.

Usage:
    python audit_tailored_resumes.py [--missing-only]
"""

import json
import os
import sys

import requests

SUPABASE_URL = "https://whlfknhcueovaelkisgp.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CLERK_USER_ID = "user_3AJg40z6I5NnXId0UlhPTeUC9Ub"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

MISSING_ONLY = "--missing-only" in sys.argv


def load_applications() -> list[dict]:
    all_apps = []
    offset = 0
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/applications",
            headers=HEADERS,
            params={
                "clerk_user_id": f"eq.{CLERK_USER_ID}",
                "select": "id,company,role,status,tailored_resume,created_at",
                "order": "created_at.desc",
                "offset": offset,
                "limit": 500,
            },
        )
        if resp.status_code != 200:
            print(f"ERROR: {resp.status_code} {resp.text}")
            sys.exit(1)
        batch = resp.json()
        all_apps.extend(batch)
        if len(batch) < 500:
            break
        offset += 500
    return all_apps


def main():
    if not SUPABASE_KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY environment variable")
        sys.exit(1)

    apps = load_applications()
    total = len(apps)

    has_resume = [a for a in apps if a.get("tailored_resume") and len(a["tailored_resume"]) > 200]
    missing = [a for a in apps if not a.get("tailored_resume") or len(a.get("tailored_resume", "")) <= 200]

    print("\n=== Tailored Resume Audit ===")
    print(f"Total applications: {total}")
    print(f"Have tailored resume: {len(has_resume)} ({100*len(has_resume)//total}%)")
    print(f"Missing tailored resume: {len(missing)} ({100*len(missing)//total}%)")

    # Break down missing by status
    by_status: dict[str, int] = {}
    for a in missing:
        s = a.get("status", "unknown")
        by_status[s] = by_status.get(s, 0) + 1

    print("\nMissing by status:")
    for status, count in sorted(by_status.items(), key=lambda x: -x[1]):
        print(f"  {status:30s} {count}")

    if MISSING_ONLY or len(missing) <= 50:
        print("\nMissing applications:")
        for a in missing:
            company = (a.get("company") or "").encode("ascii", "replace").decode()
            role = (a.get("role") or "").encode("ascii", "replace").decode()
            print(f"  {a['id'][:8]}  {company[:35]:35s}  {role[:40]}")
    else:
        print(f"\n(Run with --missing-only to list all {len(missing)} missing apps)")
        print("\nFirst 20 missing:")
        for a in missing[:20]:
            company = (a.get("company") or "").encode("ascii", "replace").decode()
            role = (a.get("role") or "").encode("ascii", "replace").decode()
            print(f"  {company[:35]:35s}  {role[:40]}")

    # Save missing list to JSON for follow-up
    out = "missing_tailored_resumes.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump([{"id": a["id"], "company": a.get("company", ""), "role": a.get("role", ""), "status": a.get("status", "")}
                   for a in missing], f, indent=2, ensure_ascii=False)
    print(f"\nMissing list saved to {out}")


if __name__ == "__main__":
    main()
