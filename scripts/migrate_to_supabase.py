#!/usr/bin/env python3
"""Migrate local application metadata.json files to Supabase."""

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


def load_metadata(folder: Path) -> dict | None:
    """Load metadata.json from an application folder."""
    meta_path = folder / "metadata.json"
    if not meta_path.exists():
        return None
    with open(meta_path, encoding="utf-8", errors="replace") as f:
        return json.load(f)


def job_description_text(folder: Path) -> str | None:
    """Read job-description.md if it exists."""
    jd_path = folder / "job-description.md"
    if jd_path.exists():
        return jd_path.read_text(encoding="utf-8", errors="replace")[:50000]
    return None


def map_to_application_row(meta: dict, folder: Path) -> dict:
    """Map local metadata.json to Supabase applications table row."""
    jd_text = job_description_text(folder)

    row = {
        "clerk_user_id": CLERK_USER_ID,
        "company": meta.get("company", "Unknown"),
        "role": meta.get("role", "Unknown"),
        "location": meta.get("location") or None,
        "compensation": meta.get("compensation"),
        "applied_date": meta.get("applied_date"),
        "source": meta.get("source"),
        "source_url": meta.get("source_url") or None,
        "status": meta.get("status", "evaluating"),
        "follow_up_date": meta.get("follow_up_date"),
        "contact": meta.get("contact", ""),
        "notes": meta.get("notes", ""),
        "resume_version": meta.get("resume_version"),
        "cover_letter": meta.get("cover_letter"),
        "job_description": jd_text,
        "former_employer": meta.get("former_employer", False),
        "tailoring_intensity": meta.get("tailoring_intensity"),
        "interview_date": meta.get("interview_date"),
        "interview_round": meta.get("interview_round"),
        "interview_type": meta.get("interview_type"),
        "interview_notes": meta.get("interview_notes_file"),
        "rejection_date": meta.get("rejection_date"),
        "rejection_reason": meta.get("rejection_reason"),
        "rejection_insights": meta.get("rejection_insights"),
        "offer": meta.get("offer") if any(v for v in (meta.get("offer") or {}).values()) else None,
        "offer_accepted": meta.get("offer_accepted"),
        "learning_flags": meta.get("learning_flags", []),
    }

    # Validate status
    valid_statuses = {
        "evaluating", "pending_review", "ready_to_apply",
        "applied", "interviewing", "offered",
        "rejected", "withdrawn", "accepted",
    }
    if row["status"] not in valid_statuses:
        row["status"] = "evaluating"

    # Validate tailoring_intensity
    if row["tailoring_intensity"] not in (None, "light", "moderate", "heavy"):
        row["tailoring_intensity"] = None

    return row


def map_to_match_score(meta: dict, application_id: str) -> dict | None:
    """Map match_score from metadata to match_scores table row."""
    score = meta.get("match_score", {})
    overall = score.get("overall", "")
    if not overall or overall not in ("strong", "good", "stretch", "long_shot"):
        return None

    matched = score.get("requirements_matched", [])
    partial = score.get("requirements_partial", [])
    gaps = score.get("gaps", [])

    # Convert string lists to structured format
    def to_req_obj(items):
        return [{"requirement": item} if isinstance(item, str) else item for item in items]

    return {
        "application_id": application_id,
        "clerk_user_id": CLERK_USER_ID,
        "overall": overall,
        "strong_count": len(matched),
        "partial_count": len(partial),
        "gap_count": len(gaps),
        "requirements_matched": json.dumps(to_req_obj(matched)),
        "requirements_partial": json.dumps(to_req_obj(partial)),
        "gaps": json.dumps(gaps if isinstance(gaps, list) else []),
        "addressable_gaps": json.dumps(score.get("addressable_gaps", [])),
        "hard_gaps": json.dumps(score.get("hard_gaps", [])),
        "keywords": score.get("keywords", []),
        "red_flags": score.get("red_flags", []),
    }


def insert_application(row: dict) -> str | None:
    """Insert application row and return its ID."""
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/applications",
        headers=HEADERS,
        json=row,
    )
    if resp.status_code == 201:
        data = resp.json()
        return data[0]["id"] if data else None
    else:
        print(f"  ERROR inserting application: {resp.status_code} {resp.text[:200]}")
        return None


def insert_match_score(row: dict) -> bool:
    """Insert match score row."""
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/match_scores",
        headers=HEADERS,
        json=row,
    )
    if resp.status_code == 201:
        return True
    else:
        print(f"  ERROR inserting match_score: {resp.status_code} {resp.text[:200]}")
        return False


def main():
    if not SUPABASE_KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY environment variable")
        sys.exit(1)

    folders = sorted(APPLICATIONS_DIR.iterdir())
    folders = [f for f in folders if f.is_dir() and (f / "metadata.json").exists()]

    print(f"Found {len(folders)} applications to migrate")

    migrated = 0
    scored = 0
    errors = 0

    for folder in folders:
        meta = load_metadata(folder)
        if not meta:
            continue

        row = map_to_application_row(meta, folder)
        app_id = insert_application(row)

        if app_id:
            migrated += 1
            # Insert match score if available
            score_row = map_to_match_score(meta, app_id)
            if score_row:
                if insert_match_score(score_row):
                    scored += 1
        else:
            errors += 1

        if migrated % 50 == 0 and migrated > 0:
            print(f"  ...{migrated} migrated so far")

    print(f"\nDone! {migrated} applications migrated, {scored} with scores, {errors} errors")


if __name__ == "__main__":
    main()
