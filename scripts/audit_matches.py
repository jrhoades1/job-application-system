#!/usr/bin/env python3
"""Show strong/good matches and keyword patterns."""

import os
import sys
from collections import Counter

import requests

URL = "https://whlfknhcueovaelkisgp.supabase.co"
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
UID = "user_3AJg40z6I5NnXId0UlhPTeUC9Ub"


def fetch_all(endpoint, params):
    rows = []
    offset = 0
    while True:
        resp = requests.get(
            f"{URL}/rest/v1/{endpoint}", headers=HEADERS,
            params={**params, "offset": offset, "limit": 500},
        )
        if resp.status_code != 200:
            print(f"ERROR: {resp.status_code}")
            return rows
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < 500:
            break
        offset += 500
    return rows


def main():
    if not KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    # Get all scores
    all_scores = fetch_all("match_scores", {
        "clerk_user_id": f"eq.{UID}",
        "select": "application_id,overall,match_percentage,strong_count,partial_count,gap_count,keywords",
        "order": "match_percentage.desc",
    })
    print(f"Total scores: {len(all_scores)}")

    # Get all apps (lightweight)
    all_apps = fetch_all("applications", {
        "clerk_user_id": f"eq.{UID}",
        "select": "id,company,role,status,location",
    })
    app_map = {a["id"]: a for a in all_apps}

    # Show strong + good matches
    for band in ["strong", "good"]:
        matches = [s for s in all_scores if s["overall"] == band]
        matches.sort(key=lambda s: s.get("match_percentage") or 0, reverse=True)

        print(f"\n{'=' * 70}")
        print(f" {band.upper()} MATCHES ({len(matches)})")
        print(f"{'=' * 70}")

        for s in matches:
            app = app_map.get(s["application_id"], {})
            pct = s.get("match_percentage") or 0
            company = app.get("company", "?")
            role = app.get("role", "?")
            kw = s.get("keywords") or []
            kw_str = ", ".join(kw[:8])

            print(f"  {pct:5.1f}% | {company:<28} | {role}")
            if kw_str:
                print(f"         kw: {kw_str}")

    # Keyword frequency by band
    print(f"\n{'=' * 70}")
    print(" KEYWORD PATTERNS: What you match vs what you don't")
    print(f"{'=' * 70}")

    for bands, label in [
        (["strong", "good"], "STRONG + GOOD (you match these)"),
        (["long_shot"], "LONG SHOT (you don't match these)"),
    ]:
        kw_list = []
        for s in all_scores:
            if s["overall"] in bands:
                kw_list.extend(s.get("keywords") or [])

        c = Counter(kw_list)
        total_in_band = sum(1 for s in all_scores if s["overall"] in bands)
        print(f"\n  {label} ({total_in_band} apps):")
        for kw, count in c.most_common(15):
            print(f"    {kw:<25} {count:>4}x ({count/total_in_band*100:.0f}%)")

    # Role title patterns
    print(f"\n{'=' * 70}")
    print(" ROLE TITLE PATTERNS")
    print(f"{'=' * 70}")

    for bands, label in [
        (["strong", "good"], "Strong/Good roles"),
        (["long_shot"], "Long Shot roles"),
    ]:
        scored_ids = {s["application_id"] for s in all_scores if s["overall"] in bands}
        titles = [app_map[aid].get("role", "") for aid in scored_ids if aid in app_map]

        # Extract common title words
        words = []
        for t in titles:
            for w in t.lower().split():
                if len(w) > 3 and w not in ("the", "and", "for", "with", "from"):
                    words.append(w)

        c = Counter(words)
        print(f"\n  {label} — common title words:")
        for w, count in c.most_common(10):
            print(f"    {w:<20} {count:>4}x")


if __name__ == "__main__":
    main()
