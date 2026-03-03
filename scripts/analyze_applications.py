#!/usr/bin/env python3
"""Job Application Analytics — Why did some get responses and some didn't?

Pulls all application data from Supabase and generates a comprehensive
analytics report covering response rates, patterns, and insights.

Usage:
    python analyze_applications.py

Output: prints report + saves CSV to /tmp/app_analytics.csv
"""

import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime

import requests

SUPABASE_URL = "https://whlfknhcueovaelkisgp.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CLERK_USER_ID = "user_3AJg40z6I5NnXId0UlhPTeUC9Ub"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def load_all_applications() -> list[dict]:
    all_apps = []
    offset = 0
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/applications",
            headers=HEADERS,
            params={
                "clerk_user_id": f"eq.{CLERK_USER_ID}",
                "select": "*",
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


# ============================================================
# Feature extraction
# ============================================================

def extract_seniority(role: str) -> str:
    role_l = role.lower().strip()
    # Check most specific first
    if re.search(r"\b(?:cto|cio|chief)\b", role_l):
        return "C-Suite"
    if re.search(r"\bhead of\b", role_l):
        return "Head of"
    if re.search(r"\b(?:svp|evp)\b", role_l) or "vice president" in role_l or re.search(r"\bvp\b", role_l):
        return "VP"
    if re.search(r"\b(?:senior|sr\.?)\s+director\b", role_l):
        return "Sr Director"
    if re.search(r"\bdirector\b", role_l) or re.search(r"\bdir[,\s]", role_l):
        return "Director"
    if re.search(r"\bmanag(?:er|ing)\b", role_l):
        return "Manager"
    if re.search(r"\b(?:senior|sr\.?|lead|principal|staff)\b", role_l):
        return "Senior IC"
    if re.search(r"\barchitect\b", role_l):
        return "Architect"
    return "Other"


def extract_domain(company: str, role: str, jd: str = "") -> str:
    text = f"{company} {role} {jd}".lower()
    if any(x in text for x in ["health", "medical", "clinical", "pharma", "care", "hipaa", "patient"]):
        return "Healthcare"
    if any(x in text for x in ["fintech", "financial", "banking", "insurance", "payment", "lending"]):
        return "Finance"
    if any(x in text for x in ["defense", "military", "dod", "clearance", "classified"]):
        return "Defense"
    if any(x in text for x in ["security", "cyber"]):
        return "Cybersecurity"
    if any(x in text for x in ["ecommerce", "e-commerce", "retail", "marketplace", "shopping"]):
        return "E-Commerce"
    if any(x in text for x in ["saas", "b2b", "enterprise software"]):
        return "SaaS"
    if any(x in text for x in ["ai ", "machine learning", "ml ", "data platform", "data engineering"]):
        return "AI/ML/Data"
    return "General Tech"


def extract_work_type(role: str, jd: str = "") -> str:
    text = f"{role} {jd}".lower()
    if "remote" in text:
        return "Remote"
    if "hybrid" in text:
        return "Hybrid"
    if any(x in text for x in ["on-site", "onsite", "in-office"]):
        return "On-site"
    return "Unknown"


def extract_tech_signals(jd: str) -> list[str]:
    if not jd:
        return []
    techs = []
    patterns = {
        "Python": r"\bPython\b",
        "Java": r"\bJava\b(?!Script)",
        "JavaScript/TypeScript": r"\b(?:JavaScript|TypeScript)\b",
        "Go": r"\bGo(?:lang)?\b",
        "Rust": r"\bRust\b",
        "C++/C#": r"\bC(?:\+\+|#)\b",
        ".NET": r"\.NET\b",
        "React": r"\bReact\b",
        "AWS": r"\bAWS\b",
        "Azure": r"\bAzure\b",
        "GCP": r"\bGCP\b|Google Cloud",
        "Kubernetes": r"\bKubernetes\b|k8s",
        "Docker": r"\bDocker\b",
        "Terraform": r"\bTerraform\b",
        "PostgreSQL": r"\bPostgre",
        "MongoDB": r"\bMongo",
        "Redis": r"\bRedis\b",
        "Kafka": r"\bKafka\b",
        "GraphQL": r"\bGraphQL\b",
        "AI/ML": r"\b(?:AI|ML|machine learning|LLM|NLP)\b",
        "Agile/Scrum": r"\b(?:Agile|Scrum)\b",
        "CI/CD": r"\bCI/?CD\b",
    }
    for name, pattern in patterns.items():
        if re.search(pattern, jd, re.IGNORECASE):
            techs.append(name)
    return techs


def extract_yoe_required(jd: str) -> int | None:
    if not jd:
        return None
    m = re.search(r"(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)", jd, re.IGNORECASE)
    return int(m.group(1)) if m else None


def cl_word_count(cl: str) -> int | None:
    if not cl or len(cl) < 100:
        return None
    return len(cl.split())


def outcome_category(status: str) -> str:
    if status in ("interviewing", "offered"):
        return "Got Response"
    if status == "rejected":
        return "Rejected"
    if status == "applied":
        return "Pending"
    if status == "withdrawn":
        return "Withdrawn"
    return "Other"


# ============================================================
# Analytics
# ============================================================

def rate(subset: list, total_count: int) -> str:
    if total_count == 0:
        return "0%"
    return f"{len(subset)/total_count*100:.1f}%"


def print_section(title: str):
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}\n")


def analyze_by_dimension(apps: list[dict], dimension: str, extract_fn, min_count: int = 5):
    """Analyze response rate by a categorical dimension."""
    groups = defaultdict(list)
    for app in apps:
        val = extract_fn(app)
        groups[val].append(app)

    print(f"  {'Category':<25s} {'Total':>6s} {'Rejected':>9s} {'Response':>9s} {'Pending':>9s} {'Resp%':>7s}")
    print(f"  {'-'*25} {'-'*6} {'-'*9} {'-'*9} {'-'*9} {'-'*7}")

    rows = []
    for cat, group in sorted(groups.items(), key=lambda x: -len(x[1])):
        if len(group) < min_count:
            continue
        total = len(group)
        rejected = sum(1 for a in group if a["_outcome"] == "Rejected")
        response = sum(1 for a in group if a["_outcome"] == "Got Response")
        pending = sum(1 for a in group if a["_outcome"] == "Pending")
        decided = rejected + response
        resp_rate = f"{response/decided*100:.1f}%" if decided > 0 else "N/A"
        print(f"  {cat:<25s} {total:>6d} {rejected:>9d} {response:>9d} {pending:>9d} {resp_rate:>7s}")
        rows.append((cat, total, rejected, response, pending, resp_rate))

    return rows


def main():
    if not SUPABASE_KEY:
        print("Set SUPABASE_SERVICE_ROLE_KEY environment variable")
        sys.exit(1)

    apps = load_all_applications()
    print(f"Loaded {len(apps)} applications\n")

    # Enrich each app with extracted features
    for app in apps:
        role = app.get("role", "")
        company = app.get("company", "")
        jd = app.get("job_description") or ""
        cl = app.get("cover_letter") or ""

        app["_seniority"] = extract_seniority(role)
        app["_domain"] = extract_domain(company, role, jd)
        app["_work_type"] = extract_work_type(role, jd)
        app["_tech_stack"] = extract_tech_signals(jd)
        app["_yoe_required"] = extract_yoe_required(jd)
        app["_cl_words"] = cl_word_count(cl)
        app["_outcome"] = outcome_category(app.get("status", ""))
        app["_has_jd"] = bool(jd and len(jd) > 100)
        app["_has_cl"] = bool(cl and len(cl) > 100)
        app["_has_resume"] = bool(app.get("tailored_resume") and len(app["tailored_resume"]) > 100)
        app["_source"] = app.get("source", "Unknown")

        # Parse applied date for temporal analysis
        ad = app.get("applied_date")
        if ad:
            try:
                dt = datetime.fromisoformat(ad)
                app["_month"] = dt.strftime("%Y-%m")
                app["_weekday"] = dt.strftime("%A")
                app["_week_num"] = dt.isocalendar()[1]
            except (ValueError, TypeError):
                app["_month"] = None
                app["_weekday"] = None
                app["_week_num"] = None
        else:
            app["_month"] = None
            app["_weekday"] = None
            app["_week_num"] = None

    # ============================================================
    # Overall Summary
    # ============================================================
    print_section("OVERALL SUMMARY")

    outcomes = Counter(a["_outcome"] for a in apps)
    for o, c in outcomes.most_common():
        print(f"  {o}: {c} ({c/len(apps)*100:.1f}%)")

    decided = [a for a in apps if a["_outcome"] in ("Rejected", "Got Response")]
    responses = [a for a in apps if a["_outcome"] == "Got Response"]
    print(f"\n  Response rate (of decided): {len(responses)}/{len(decided)} = {len(responses)/max(len(decided),1)*100:.1f}%")

    # ============================================================
    # By Seniority
    # ============================================================
    print_section("BY SENIORITY LEVEL")
    analyze_by_dimension(apps, "Seniority", lambda a: a["_seniority"])

    # ============================================================
    # By Domain/Industry
    # ============================================================
    print_section("BY INDUSTRY/DOMAIN")
    analyze_by_dimension(apps, "Domain", lambda a: a["_domain"])

    # ============================================================
    # By Source
    # ============================================================
    print_section("BY SOURCE")
    analyze_by_dimension(apps, "Source", lambda a: a["_source"], min_count=2)

    # ============================================================
    # By Work Type
    # ============================================================
    print_section("BY WORK TYPE")
    analyze_by_dimension(apps, "Work Type", lambda a: a["_work_type"])

    # ============================================================
    # By Month Applied
    # ============================================================
    print_section("BY MONTH APPLIED")
    dated = [a for a in apps if a["_month"]]
    analyze_by_dimension(dated, "Month", lambda a: a["_month"], min_count=3)

    # ============================================================
    # Cover Letter Analysis
    # ============================================================
    print_section("COVER LETTER ANALYSIS")

    with_cl = [a for a in apps if a["_has_cl"]]
    without_cl = [a for a in apps if not a["_has_cl"]]
    print(f"  With cover letter: {len(with_cl)} ({len(with_cl)/len(apps)*100:.0f}%)")
    print(f"  Without: {len(without_cl)}")

    # CL word count by outcome
    print("\n  Cover letter length by outcome:")
    for outcome in ["Got Response", "Rejected", "Pending"]:
        cls = [a["_cl_words"] for a in apps if a["_outcome"] == outcome and a["_cl_words"]]
        if cls:
            avg = sum(cls) / len(cls)
            print(f"    {outcome}: avg {avg:.0f} words (n={len(cls)})")

    # ============================================================
    # Data Completeness for Analytics
    # ============================================================
    print_section("DATA COMPLETENESS")

    fields = {
        "Job Description": "_has_jd",
        "Cover Letter": "_has_cl",
        "Tailored Resume": "_has_resume",
        "Applied Date": lambda a: bool(a.get("applied_date")),
        "Location": lambda a: bool(a.get("location")),
        "Compensation": lambda a: bool(a.get("compensation")),
        "Source URL": lambda a: bool(a.get("source_url")),
    }

    for name, check in fields.items():
        if callable(check):
            count = sum(1 for a in apps if check(a))
        else:
            count = sum(1 for a in apps if a.get(check))
        pct = count / len(apps) * 100
        bar = "#" * int(pct / 2) + "." * (50 - int(pct / 2))
        print(f"  {name:<20s} {count:>4d}/{len(apps)} ({pct:5.1f}%) [{bar}]")

    # ============================================================
    # Tech Stack (when JDs available)
    # ============================================================
    jd_apps = [a for a in apps if a["_has_jd"]]
    if jd_apps:
        print_section(f"TECH STACK SIGNALS (from {len(jd_apps)} JDs)")

        tech_outcomes = defaultdict(lambda: {"total": 0, "rejected": 0, "response": 0, "pending": 0})
        for a in jd_apps:
            for tech in a["_tech_stack"]:
                tech_outcomes[tech]["total"] += 1
                if a["_outcome"] == "Rejected":
                    tech_outcomes[tech]["rejected"] += 1
                elif a["_outcome"] == "Got Response":
                    tech_outcomes[tech]["response"] += 1
                elif a["_outcome"] == "Pending":
                    tech_outcomes[tech]["pending"] += 1

        print(f"  {'Tech':<25s} {'Total':>6s} {'Rejected':>9s} {'Response':>9s} {'Pending':>9s}")
        print(f"  {'-'*25} {'-'*6} {'-'*9} {'-'*9} {'-'*9}")
        for tech, counts in sorted(tech_outcomes.items(), key=lambda x: -x[1]["total"]):
            if counts["total"] >= 3:
                print(f"  {tech:<25s} {counts['total']:>6d} {counts['rejected']:>9d} {counts['response']:>9d} {counts['pending']:>9d}")

    # ============================================================
    # Key Insights
    # ============================================================
    print_section("KEY INSIGHTS")

    total_decided = len(decided)
    total_responses = len(responses)

    if total_decided > 0:
        print(f"  1. Overall response rate: {total_responses}/{total_decided} ({total_responses/total_decided*100:.1f}%)")

    # Best/worst seniority
    seniority_rates = {}
    for a in decided:
        s = a["_seniority"]
        if s not in seniority_rates:
            seniority_rates[s] = {"total": 0, "response": 0}
        seniority_rates[s]["total"] += 1
        if a["_outcome"] == "Got Response":
            seniority_rates[s]["response"] += 1

    if seniority_rates:
        best = max(seniority_rates.items(), key=lambda x: x[1]["response"]/max(x[1]["total"],1))
        if best[1]["total"] >= 3:
            print(f"  2. Best seniority: {best[0]} ({best[1]['response']}/{best[1]['total']} = {best[1]['response']/best[1]['total']*100:.0f}%)")

    # Applications still pending (may never get response)
    pending = [a for a in apps if a["_outcome"] == "Pending"]
    if pending:
        print(f"  3. {len(pending)} applications still 'applied' with no response — consider marking as rejected after 60 days")

    # Healthcare focus
    hc = [a for a in decided if a["_domain"] == "Healthcare"]
    hc_resp = [a for a in hc if a["_outcome"] == "Got Response"]
    if hc:
        print(f"  4. Healthcare response rate: {len(hc_resp)}/{len(hc)} ({len(hc_resp)/len(hc)*100:.1f}%)")

    print(f"\n  NOTE: {len(apps) - len(jd_apps)} apps missing job descriptions — import JDs for deeper analysis")
    print(f"  NOTE: {len(apps) - sum(1 for a in apps if a.get('applied_date'))} apps missing applied dates")

    # ============================================================
    # Export CSV
    # ============================================================
    csv_path = "/tmp/app_analytics.csv"
    with open(csv_path, "w", encoding="utf-8") as f:
        headers = ["company", "role", "status", "outcome", "source", "seniority",
                    "domain", "work_type", "applied_date", "month",
                    "has_jd", "has_cl", "has_resume", "cl_words",
                    "yoe_required", "tech_stack"]
        f.write(",".join(headers) + "\n")
        for a in apps:
            row = [
                f'"{a.get("company", "")}"',
                f'"{a.get("role", "")}"',
                a.get("status", "") or "",
                a["_outcome"],
                a["_source"],
                a["_seniority"],
                a["_domain"],
                a["_work_type"],
                a.get("applied_date") or "",
                a.get("_month") or "",
                str(a["_has_jd"]),
                str(a["_has_cl"]),
                str(a["_has_resume"]),
                str(a.get("_cl_words") or ""),
                str(a.get("_yoe_required") or ""),
                f'"{"|".join(a["_tech_stack"])}"',
            ]
            f.write(",".join(row) + "\n")

    print(f"\n  CSV exported to {csv_path}")


if __name__ == "__main__":
    main()
