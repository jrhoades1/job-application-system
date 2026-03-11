#!/usr/bin/env python3
"""Audit data completeness across all applications."""

import os
import sys
from collections import Counter

import requests

SUPABASE_URL = "https://whlfknhcueovaelkisgp.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CLERK_USER_ID = "user_3AJg40z6I5NnXId0UlhPTeUC9Ub"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def paginated_get(endpoint, params_base, select):
    """Fetch all rows with pagination."""
    all_rows = []
    offset = 0
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/{endpoint}",
            headers=HEADERS,
            params={**params_base, "select": select, "offset": offset, "limit": 500},
        )
        if resp.status_code != 200:
            print(f"ERROR fetching {endpoint}: {resp.status_code} {resp.text[:200]}")
            sys.exit(1)
        batch = resp.json()
        all_rows.extend(batch)
        if len(batch) < 500:
            break
        offset += 500
    return all_rows


def count_not_null(field):
    """Count rows where field is not null using exact count header."""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/applications",
        headers={**HEADERS, "Prefer": "count=exact"},
        params={
            "clerk_user_id": f"eq.{CLERK_USER_ID}",
            "select": "id",
            f"{field}": "not.is.null",
            "limit": 0,
        },
    )
    cr = resp.headers.get("content-range", "")
    if "/" in cr:
        total = cr.split("/")[1]
        return int(total) if total != "*" else 0
    return 0


def main():
    if not SUPABASE_KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY environment variable")
        sys.exit(1)

    # Load lightweight fields
    apps = paginated_get(
        "applications",
        {"clerk_user_id": f"eq.{CLERK_USER_ID}"},
        "id,company,role,status,source,applied_date,location,compensation,source_url,notes,rejection_date",
    )
    total = len(apps)
    print(f"Total applications: {total}\n")

    # Count large text fields via not-null queries
    jd_count = count_not_null("job_description")
    cl_count = count_not_null("cover_letter")
    tr_count = count_not_null("tailored_resume")

    # Count match scores
    scores = paginated_get(
        "match_scores",
        {"clerk_user_id": f"eq.{CLERK_USER_ID}"},
        "application_id",
    )
    score_ids = {s["application_id"] for s in scores}
    score_count = len(score_ids)

    # Print field completeness
    print(f"{'Field':<20} {'Has':>6} {'Miss':>6} {'%':>7}")
    print("-" * 44)

    small_checks = [
        ("company", lambda a: bool(a.get("company"))),
        ("role", lambda a: bool(a.get("role"))),
        ("status", lambda a: bool(a.get("status"))),
        ("source", lambda a: bool(a.get("source"))),
        ("applied_date", lambda a: bool(a.get("applied_date"))),
        ("location", lambda a: bool(a.get("location"))),
        ("compensation", lambda a: bool(a.get("compensation"))),
        ("source_url", lambda a: bool(a.get("source_url"))),
        ("notes", lambda a: bool(a.get("notes"))),
        ("rejection_date", lambda a: bool(a.get("rejection_date"))),
    ]

    for field, check in small_checks:
        has = sum(1 for a in apps if check(a))
        miss = total - has
        pct = has / total * 100
        print(f"{field:<20} {has:>6} {miss:>6} {pct:>6.1f}%")

    for name, count in [
        ("job_description", jd_count),
        ("cover_letter", cl_count),
        ("tailored_resume", tr_count),
        ("match_score", score_count),
    ]:
        miss = total - count
        pct = count / total * 100
        print(f"{name:<20} {count:>6} {miss:>6} {pct:>6.1f}%")

    # Status breakdown
    print()
    statuses = Counter(a.get("status", "(null)") for a in apps)
    print("Status breakdown:")
    for s, c in statuses.most_common():
        print(f"  {s:<20} {c:>5}")

    # Source breakdown
    print()
    sources = Counter(a.get("source", "(null)") for a in apps)
    print("Source breakdown:")
    for s, c in sources.most_common():
        print(f"  {s:<20} {c:>5}")

    # Swooped gaps
    swooped = [a for a in apps if a.get("source") == "swooped"]
    print(f"\nSwooped ({len(swooped)}) - gaps:")
    for field, check in small_checks:
        missing = sum(1 for a in swooped if not check(a))
        if missing > 0:
            print(f"  {field:<20} {missing:>5} missing")

    # Non-swooped gaps
    non_swooped = [a for a in apps if a.get("source") != "swooped"]
    print(f"\nNon-Swooped ({len(non_swooped)}) - gaps:")
    for field, check in small_checks:
        missing = sum(1 for a in non_swooped if not check(a))
        if missing > 0:
            print(f"  {field:<20} {missing:>5} missing")

    # Apps missing applied_date
    no_date = [a for a in apps if not a.get("applied_date")]
    print(f"\n--- {len(no_date)} apps missing applied_date ---")
    src_bd = Counter(a.get("source", "(null)") for a in no_date)
    for s, c in src_bd.most_common():
        print(f"  {s:<15} {c:>5}")

    # Unscored apps with JDs
    print("\n--- Score coverage ---")
    print(f"  Scored:        {score_count}")
    print(f"  Have JD:       {jd_count}")
    print(f"  No JD (unscorable): {total - jd_count}")
    print(f"  Have JD but no score: {jd_count - score_count}")


if __name__ == "__main__":
    main()
