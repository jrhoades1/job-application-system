#!/usr/bin/env python3
"""Batch algorithmic scoring for all applications with job descriptions.

Ports the TypeScript scoring logic (score-requirement.ts + calculate-score.ts)
to Python and runs it against all applications in Supabase that have a
job_description. Results are upserted into the match_scores table.

No AI tokens needed — pure algorithmic matching.

Usage:
    SUPABASE_SERVICE_ROLE_KEY="..." python batch_score.py [--dry-run]
"""

import json
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

# ---------------------------------------------------------------------------
# Achievements — Jimmy's inventory (from master/achievements.md)
# ---------------------------------------------------------------------------
ACHIEVEMENTS: dict[str, list[str]] = {
    "Leadership & Team Building": [
        "Built engineering team from zero to 22 (MedQuest), including QA, Product, and offshore",
        "Built and scaled team from inception to 15 with key offshore resources (Red Spot)",
        "Directed team of 10 engineers launching healthcare apps in startup environment (Perceptive)",
        "Managed 50+ developers across US, Ukraine, and Central America (Cognizant)",
        "Mentored engineers on agile best practices, increasing team velocity by 15% within 6 months",
        "Cultivated high-performing culture delivering 4 product launches annually",
    ],
    "AI / ML Integration": [
        "Spearheaded AI/ML integration into healthcare workflows, reducing processing times (ilumed)",
        "Integrated AI into product offerings, slashing development cycles by 30% and boosting feature adoption by 40% (Perceptive)",
        "Implemented AI-driven analytics, enhancing decision-making and cutting operational costs by 18% (Red Spot)",
        "AI-driven optimizations expanded beneficiary coverage from 50K to 90K (ilumed)",
        "Personal: applying NLP and ML to undeciphered rongorongo glyphs — digitizing corpora, fine-tuning multilingual LLMs",
    ],
    "Healthcare IT & Compliance": [
        "Overhauled system architecture for HIPAA compliance, achieving 99.9% uptime (ilumed)",
        "Led technical reviews ensuring compliance with HL7, FHIR standards, improving data accuracy by 15% (Cognizant)",
        "Revamped failing diagnostic imaging system to production-ready across 100 centers in 13 states (MedQuest)",
        "Automated insurance verification, reducing errors by 60% and saving 500+ staff hours annually (MedQuest)",
        "Integrated clinical support features enhancing decision-making for providers (ilumed)",
        "Led SOC2/HITRUST certification process on schedule before departure; established compliance frameworks, controls, and audit preparation (ilumed)",
    ],
    "Architecture & Scalability": [
        "Transformed monolithic app into scalable microservices and multi-tenant architecture (Cognizant)",
        "Designed microservices architecture cutting latency by 20% across patient-facing platforms (Cognizant)",
        "Enhanced system scalability with cloud solutions enabling 50% increase in user base (Perceptive)",
        "Revamped patient scheduling system integrating AWS, Azure, and SaaS — enabled 200K+ appointments with 40% revenue increase (Red Spot)",
        "Executed AWS integrations accelerating deployment timelines by 25% for 5 key projects (Cognizant)",
    ],
    "Operational Efficiency & Business Impact": [
        "Expanded beneficiary coverage from 50,000 to 90,000 (ilumed)",
        "Developed multi-quarter roadmaps driving 20% growth in operational efficiency (ilumed)",
        "Drove digital transformation launching four mobile healthcare apps (Perceptive)",
        "Instituted DevOps and CI/CD practices, improving reliability by 35% and deployment frequency by 50% (Red Spot)",
        "Aligned technical roadmaps with business needs, growing client base by 12% in 2 years (Red Spot)",
        "Pioneered web-based scheduling platform increasing appointment efficiency by 45% across 100+ centers (MedQuest)",
        "Oversaw $2M annual budget aligning resources to scalable technology integrations (MedQuest)",
        "Collaborated with operations to streamline workflows, reducing manual processes by 35% (Perceptive)",
    ],
    "Education": [
        "MBA — Shorter University",
        "BS Management Information Systems — University of Alabama Birmingham",
    ],
    "Technical Breadth": [
        "Languages: Python, Java, C#, NodeJS, SQL",
        "Databases: SQL Server, MySQL, Oracle, DynamoDB",
        "Cloud: AWS, Azure, Google Cloud",
        "Practices: Kubernetes, CI/CD, Microservices, API Development, Agile/Scrum",
        "Healthcare: EHR (Epic, HL7, FHIR), Claims Processing, DICOM, Value-Based Care",
    ],
}

# ---------------------------------------------------------------------------
# Scoring logic (ported from TypeScript)
# ---------------------------------------------------------------------------

DIRECT_KEYWORD_RE = re.compile(
    r"\b(?:Python|Java|AWS|Azure|GCP|Kubernetes|Docker|Terraform|React|Node|"
    r"HIPAA|SOC2|FHIR|HL7|DICOM|AI|ML|NLP|microservices|agile|scrum|DevOps|CI/CD)\b",
    re.IGNORECASE,
)

# Section patterns from scoring-rules.yaml
REQUIREMENTS_RE = re.compile(
    r"(?:requirements?|qualifications?|what you.?(?:ll)?\s*need|must have|minimum|"
    r"experience|education|skills?\s+(?:and|&)\s+(?:knowledge|skills)|specialized knowledge|"
    r"technical skills|what (?:we|you).+(?:look|need)|who you are)",
    re.IGNORECASE,
)
PREFERRED_RE = re.compile(
    r"(?:preferred|nice to have|bonus|desired|plus|ideally|good to have|additional|differenti)",
    re.IGNORECASE,
)
RESPONSIBILITIES_RE = re.compile(
    r"(?:responsibilities|what you.?(?:ll)?\s*do|duties|role|about the (?:role|position)|"
    r"key (?:areas|functions)|you will|your (?:impact|mission|role))",
    re.IGNORECASE,
)

# Requirement indicators
REQUIREMENT_INDICATORS = [
    re.compile(p, re.IGNORECASE) for p in [
        r"\d+\+?\s*years?",
        r"(?:must|required|minimum)",
        r"(?:degree|bachelor|master|phd)",
        r"(?:experience (?:with|in|leading|building|managing|developing|driving))",
        r"(?:proficiency in|expertise in|deep expertise|proven)",
        r"(?:certification|certified)",
        r"(?:track record|demonstrated|strong (?:strategic|technical|communication))",
        r"(?:knowledge of|ability to|skilled in|familiarity with)",
    ]
]

# Red flags
RED_FLAG_PATTERNS = [
    (re.compile(r"wear many hats", re.IGNORECASE), "Vague role scope — 'wear many hats'"),
    (re.compile(r"fast[- ]paced", re.IGNORECASE), "Fast-paced environment (potential burnout signal)"),
]

# Keyword extraction
KEYWORD_PATTERNS = [
    re.compile(r"\b(?:Python|Java|JavaScript|TypeScript|Go|Rust|C\+\+|Ruby|Scala|Kotlin)\b", re.IGNORECASE),
    re.compile(r"\b(?:AWS|Azure|GCP|Google Cloud|Kubernetes|Docker|Terraform)\b", re.IGNORECASE),
    re.compile(r"\b(?:React|Angular|Vue|Next\.js|Node\.js|FastAPI|Django|Flask|Spring)\b", re.IGNORECASE),
    re.compile(r"\b(?:PostgreSQL|MySQL|MongoDB|Redis|DynamoDB|Elasticsearch)\b", re.IGNORECASE),
    re.compile(r"\b(?:CI/CD|DevOps|Agile|Scrum|Kanban)\b", re.IGNORECASE),
    re.compile(r"\b(?:HL7|FHIR|DICOM|HIPAA|SOC2|HITRUST|EHR|EMR)\b", re.IGNORECASE),
    re.compile(r"\b(?:AI|ML|NLP|LLM|GPT|machine learning|deep learning)\b", re.IGNORECASE),
    re.compile(r"\b(?:microservices|scalability|architecture|system design)\b", re.IGNORECASE),
]


def simple_stem(word: str) -> str:
    """Minimal stemmer matching the TypeScript implementation."""
    if len(word) <= 3:
        return word
    if word.endswith("ing") and len(word) > 5:
        return word[:-3]
    if word.endswith("tion") and len(word) > 6:
        return word[:-4]
    if word.endswith("ed") and len(word) > 4:
        return word[:-2]
    if word.endswith("ment") and len(word) > 6:
        return word[:-4]
    if word.endswith("ness") and len(word) > 6:
        return word[:-4]
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    if word.endswith("s") and not word.endswith("ss") and len(word) > 4:
        return word[:-1]
    return word


def score_requirement(requirement: str, achievements: dict[str, list[str]]) -> dict:
    """Score a single requirement against the achievement inventory."""
    req_lower = requirement.lower()
    req_words = re.findall(r"\b[a-z]{3,}\b", req_lower)
    req_terms = set(simple_stem(w) for w in req_words)

    best_score = 0.0
    best_match = None

    for category, items in achievements.items():
        for item in items:
            item_lower = item.lower()
            item_words = re.findall(r"\b[a-z]{3,}\b", item_lower)
            item_terms = set(simple_stem(w) for w in item_words)

            overlap = 0.0
            if req_terms and item_terms:
                intersection = len(req_terms & item_terms)
                overlap = intersection / max(len(req_terms), 1)

            # Direct keyword boost
            direct_keywords = DIRECT_KEYWORD_RE.findall(requirement)
            for kw in direct_keywords:
                if kw.lower() in item_lower:
                    overlap += 0.3

            # Experience level match
            years_req = re.search(r"(\d+)\+?\s*years?", req_lower)
            years_ach = re.search(r"(\d+)\+?\s*years?", item_lower)
            if years_req and years_ach:
                if int(years_ach.group(1)) >= int(years_req.group(1)):
                    overlap += 0.2

            if overlap > best_score:
                best_score = overlap
                best_match = {"evidence": item, "category": category}

    if best_score >= 0.35:
        return {
            "requirement": requirement,
            "match_type": "strong",
            "evidence": best_match["evidence"],
            "category": best_match["category"],
        }
    elif best_score >= 0.2:
        return {
            "requirement": requirement,
            "match_type": "partial",
            "evidence": best_match["evidence"] if best_match else "",
            "category": best_match["category"] if best_match else "",
        }
    else:
        return {
            "requirement": requirement,
            "match_type": "gap",
            "evidence": "",
            "category": "",
        }


def calculate_overall_score(matches: list[dict]) -> dict:
    """Calculate overall score from requirement matches."""
    if not matches:
        return {
            "overall": "long_shot",
            "match_percentage": 0.0,
            "strong_count": 0,
            "partial_count": 0,
            "gap_count": 0,
        }

    strong = [m for m in matches if m["match_type"] == "strong"]
    partial = [m for m in matches if m["match_type"] == "partial"]
    gaps = [m for m in matches if m["match_type"] == "gap"]

    total = len(matches)
    match_pct = (len(strong) + len(partial) * 0.5) / total if total > 0 else 0

    if match_pct >= 0.8 and len(gaps) == 0:
        overall = "strong"
    elif match_pct >= 0.6 and len(gaps) <= 1:
        overall = "good"
    elif match_pct >= 0.4 and len(gaps) <= 2:
        overall = "stretch"
    else:
        overall = "long_shot"

    return {
        "overall": overall,
        "match_percentage": round(match_pct * 100, 1),
        "strong_count": len(strong),
        "partial_count": len(partial),
        "gap_count": len(gaps),
    }


def extract_requirements(jd: str) -> list[str]:
    """Extract requirement bullets from a job description."""
    lines = jd.split("\n")
    requirements = []
    in_requirements_section = False
    in_preferred_section = False
    in_responsibilities_section = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Check if this line is a section header
        if REQUIREMENTS_RE.search(stripped) and len(stripped) < 100:
            in_requirements_section = True
            in_preferred_section = False
            in_responsibilities_section = False
            continue
        elif PREFERRED_RE.search(stripped) and len(stripped) < 100:
            in_requirements_section = False
            in_preferred_section = True
            in_responsibilities_section = False
            continue
        elif RESPONSIBILITIES_RE.search(stripped) and len(stripped) < 100:
            in_requirements_section = False
            in_preferred_section = False
            in_responsibilities_section = True
            continue

        # Extract bullet items from requirements section
        is_bullet = bool(re.match(r"^[\-•●○◦▪▸►\*]\s+", stripped) or re.match(r"^\d+[\.\)]\s+", stripped))

        if in_requirements_section and is_bullet:
            # Clean the bullet marker
            cleaned = re.sub(r"^[\-•●○◦▪▸►\*]\s+", "", stripped)
            cleaned = re.sub(r"^\d+[\.\)]\s+", "", cleaned)
            if len(cleaned) > 15:  # Skip very short items
                requirements.append(cleaned)
        elif not in_requirements_section and not in_preferred_section and not in_responsibilities_section:
            # Outside any section — check if the line itself looks like a requirement
            if is_bullet and any(ind.search(stripped) for ind in REQUIREMENT_INDICATORS):
                cleaned = re.sub(r"^[\-•●○◦▪▸►\*]\s+", "", stripped)
                cleaned = re.sub(r"^\d+[\.\)]\s+", "", cleaned)
                if len(cleaned) > 15:
                    requirements.append(cleaned)

    # If no section-based requirements found, fall back to indicator-based extraction
    if not requirements:
        for line in lines:
            stripped = line.strip()
            if any(ind.search(stripped) for ind in REQUIREMENT_INDICATORS):
                cleaned = re.sub(r"^[\-•●○◦▪▸►\*]\s+", "", stripped)
                cleaned = re.sub(r"^\d+[\.\)]\s+", "", cleaned)
                if len(cleaned) > 15 and cleaned not in requirements:
                    requirements.append(cleaned)

    return requirements


def extract_keywords(jd: str) -> list[str]:
    """Extract technology keywords from a job description."""
    found = set()
    for pattern in KEYWORD_PATTERNS:
        for match in pattern.finditer(jd):
            found.add(match.group(0))
    return sorted(found)


def detect_red_flags(jd: str) -> list[str]:
    """Detect red flags in a job description."""
    flags = []
    for pattern, message in RED_FLAG_PATTERNS:
        if pattern.search(jd):
            flags.append(message)
    return flags


# ---------------------------------------------------------------------------
# Supabase API
# ---------------------------------------------------------------------------

def load_applications() -> list[dict]:
    """Load all applications from Supabase."""
    all_apps = []
    offset = 0
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/applications",
            headers=HEADERS,
            params={
                "clerk_user_id": f"eq.{CLERK_USER_ID}",
                "select": "id,company,role,job_description",
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


def load_existing_scores() -> set[str]:
    """Load application IDs that already have scores."""
    ids = set()
    offset = 0
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/match_scores",
            headers=HEADERS,
            params={
                "clerk_user_id": f"eq.{CLERK_USER_ID}",
                "select": "application_id",
                "offset": offset,
                "limit": 500,
            },
        )
        if resp.status_code != 200:
            print(f"ERROR loading existing scores: {resp.status_code}")
            return ids
        batch = resp.json()
        for row in batch:
            ids.add(row["application_id"])
        if len(batch) < 500:
            break
        offset += 500
    return ids


def upsert_score(app_id: str, score_data: dict) -> bool:
    """Insert or update a match score."""
    payload = {
        "application_id": app_id,
        "clerk_user_id": CLERK_USER_ID,
        **score_data,
    }
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/match_scores",
        headers={**HEADERS, "Prefer": "return=representation,resolution=merge-duplicates"},
        json=payload,
    )
    return resp.status_code in (200, 201)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if not SUPABASE_KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY environment variable")
        sys.exit(1)

    dry_run = "--dry-run" in sys.argv

    # Load apps
    apps = load_applications()
    print(f"Loaded {len(apps)} applications from Supabase")

    with_jd = [a for a in apps if a.get("job_description") and len(a["job_description"]) > 100]
    print(f"  {len(with_jd)} have job descriptions (scoreable)")

    # Check existing scores
    existing = load_existing_scores()
    print(f"  {len(existing)} already have scores")

    to_score = [a for a in with_jd if a["id"] not in existing]
    print(f"  {len(to_score)} need scoring\n")

    if dry_run:
        print("DRY RUN — not writing to database\n")

    # Score each application
    scored = 0
    errors = 0
    band_counts = {"strong": 0, "good": 0, "stretch": 0, "long_shot": 0}

    for i, app in enumerate(to_score):
        company = app.get("company", "?")
        role = app.get("role", "?")
        jd = app["job_description"]

        # Extract requirements
        reqs = extract_requirements(jd)
        if not reqs:
            # Skip apps where we can't extract any requirements
            if i < 5 or i % 50 == 0:
                print(f"  [{i+1}/{len(to_score)}] SKIP (no requirements): {company} | {role}")
            continue

        # Score each requirement
        matches = [score_requirement(req, ACHIEVEMENTS) for req in reqs]

        # Calculate overall
        overall = calculate_overall_score(matches)

        # Extract keywords and red flags
        keywords = extract_keywords(jd)
        red_flags = detect_red_flags(jd)

        # Categorize matches
        strong_matches = [m for m in matches if m["match_type"] == "strong"]
        partial_matches = [m for m in matches if m["match_type"] == "partial"]
        gap_matches = [m for m in matches if m["match_type"] == "gap"]

        # Build score payload
        score_data = {
            "overall": overall["overall"],
            "match_percentage": overall["match_percentage"],
            "strong_count": overall["strong_count"],
            "partial_count": overall["partial_count"],
            "gap_count": overall["gap_count"],
            "requirements_matched": json.dumps([
                {"requirement": m["requirement"], "evidence": m["evidence"], "category": m["category"]}
                for m in strong_matches
            ]),
            "requirements_partial": json.dumps([
                {"requirement": m["requirement"], "evidence": m["evidence"], "category": m["category"]}
                for m in partial_matches
            ]),
            "gaps": json.dumps([m["requirement"] for m in gap_matches]),
            "addressable_gaps": json.dumps([]),
            "hard_gaps": json.dumps([]),
            "keywords": keywords,
            "red_flags": red_flags,
        }

        if dry_run:
            band_counts[overall["overall"]] += 1
            scored += 1
            if i < 10 or i % 50 == 0:
                print(f"  [{i+1}/{len(to_score)}] {overall['overall']:10s} {overall['match_percentage']:5.1f}% | {company} | {role} ({len(reqs)} reqs)")
            continue

        if upsert_score(app["id"], score_data):
            scored += 1
            band_counts[overall["overall"]] += 1
            if i < 10 or i % 25 == 0:
                print(f"  [{i+1}/{len(to_score)}] {overall['overall']:10s} {overall['match_percentage']:5.1f}% | {company} | {role} ({len(reqs)} reqs)")
        else:
            errors += 1
            print(f"  [{i+1}/{len(to_score)}] ERROR: {company} | {role}")

    print(f"\nDone! Scored {scored} applications ({errors} errors)")
    print("\nScore distribution:")
    for band in ["strong", "good", "stretch", "long_shot"]:
        count = band_counts[band]
        pct = (count / scored * 100) if scored > 0 else 0
        bar = "█" * int(pct / 2)
        print(f"  {band:10s}: {count:4d} ({pct:5.1f}%) {bar}")


if __name__ == "__main__":
    main()
