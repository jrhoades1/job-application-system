"""
Job Alert Filter — Quick-score JDs against Jimmy's bullseye profile.

Scores any job description text against bullseye_profile.yaml to determine
if a role is worth pursuing. Much faster than the full scoring engine —
pattern-matching only, no achievements comparison needed.

Usage:
    # Score a single JD file
    python job_alert_filter.py path/to/job-description.md

    # Score all pending_review applications
    python job_alert_filter.py --scan-pending

    # Score from stdin (pipe a JD in)
    cat jd.txt | python job_alert_filter.py --stdin

    # Score with verbose breakdown
    python job_alert_filter.py path/to/jd.md --verbose

    # JSON output (for pipeline integration)
    python job_alert_filter.py path/to/jd.md --json
"""

import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None

SCRIPT_DIR = Path(__file__).parent
PROFILE_PATH = SCRIPT_DIR / "bullseye_profile.yaml"
APPLICATIONS_DIR = SCRIPT_DIR / "applications"


# ---------------------------------------------------------------------------
# Profile loading
# ---------------------------------------------------------------------------

def _parse_yaml_simple(text):
    """Minimal YAML parser for the bullseye profile (avoids PyYAML dependency).

    Handles the subset of YAML used in bullseye_profile.yaml:
    - Top-level keys, nested dicts, lists of dicts, lists of strings.
    """
    if yaml:
        return yaml.safe_load(text)

    # Fallback: extract what we need with regex
    # This is intentionally limited — install PyYAML for full support.
    print("  WARNING: PyYAML not installed. Using limited parser.")
    print("           Run: pip install pyyaml")

    profile = {"must_have": [], "bonus": [], "dealbreakers": [], "thresholds": {}}

    # Extract thresholds
    thresh_block = re.search(r'thresholds:\s*\n((?:\s+\w+:\s*\d+\s*\n?)+)', text)
    if thresh_block:
        for m in re.finditer(r'(\w+):\s*(\d+)', thresh_block.group(1)):
            profile["thresholds"][m.group(1)] = int(m.group(2))

    # Extract signal blocks
    for section in ("must_have", "bonus", "dealbreakers"):
        section_match = re.search(
            rf'^{section}:\s*\n((?:.*\n)*?)(?=^[a-z_]+:|\Z)',
            text, re.MULTILINE
        )
        if not section_match:
            continue

        block = section_match.group(1)
        # Split on "- id:" entries
        items = re.split(r'\n\s+-\s+id:\s*', block)
        for item in items:
            if not item.strip():
                continue

            entry = {}
            id_match = re.match(r'(\w+)', item)
            if id_match:
                entry["id"] = id_match.group(1)

            for field in ("label", "description"):
                m = re.search(rf'{field}:\s*"([^"]*)"', item)
                if m:
                    entry[field] = m.group(1)

            weight_m = re.search(r'weight:\s*(\d+)', item)
            if weight_m:
                entry["weight"] = int(weight_m.group(1))

            penalty_m = re.search(r'penalty:\s*(-?\d+)', item)
            if penalty_m:
                entry["penalty"] = int(penalty_m.group(1))

            # Extract patterns
            patterns = re.findall(r'-\s*"([^"]*)"', item)
            # Filter out exclude_context patterns
            exclude_start = item.find("exclude_context")
            if exclude_start > 0:
                patterns_block = item[:exclude_start]
                patterns = re.findall(r'-\s*"([^"]*)"', patterns_block)

                exclude_block = item[exclude_start:]
                entry["exclude_context"] = re.findall(r'-\s*"([^"]*)"', exclude_block)

            entry["patterns"] = patterns
            profile[section].append(entry)

    return profile


def load_profile(profile_path=None):
    """Load and parse the bullseye profile."""
    path = Path(profile_path) if profile_path else PROFILE_PATH
    if not path.exists():
        print(f"ERROR: Bullseye profile not found at {path}")
        sys.exit(1)

    with open(path, encoding="utf-8") as f:
        text = f.read()

    return _parse_yaml_simple(text)


# ---------------------------------------------------------------------------
# Scoring engine
# ---------------------------------------------------------------------------

def _check_signal(signal, text_lower):
    """Check if a signal's patterns match against the JD text.

    Returns (matched: bool, matched_patterns: list[str]).
    """
    matched_patterns = []

    for pattern in signal.get("patterns", []):
        try:
            if re.search(pattern, text_lower, re.IGNORECASE):
                matched_patterns.append(pattern)
        except re.error:
            # Bad regex — try as literal
            if pattern.lower() in text_lower:
                matched_patterns.append(pattern)

    if not matched_patterns:
        return False, []

    # Check exclude_context (for dealbreakers)
    exclude_contexts = signal.get("exclude_context", [])
    if exclude_contexts and matched_patterns:
        # Find the match position and check surrounding context
        for pattern in matched_patterns:
            try:
                match = re.search(pattern, text_lower, re.IGNORECASE)
            except re.error:
                continue
            if match:
                start = max(0, match.start() - 100)
                end = min(len(text_lower), match.end() + 100)
                context = text_lower[start:end]
                if any(exc.lower() in context for exc in exclude_contexts):
                    return False, []

    return True, matched_patterns


def score_jd(text, profile):
    """Score a job description against the bullseye profile.

    Returns {
        score: int,
        tier: str,
        signals_hit: [...],
        signals_missed: [...],
        dealbreakers_hit: [...],
        bonuses_hit: [...],
    }
    """
    text_lower = text.lower()
    total_score = 0
    max_possible = 0
    signals_hit = []
    signals_missed = []
    bonuses_hit = []
    dealbreakers_hit = []

    # Score must-have signals
    for signal in profile.get("must_have", []):
        weight = signal.get("weight", 10)
        max_possible += weight
        matched, patterns = _check_signal(signal, text_lower)

        if matched:
            total_score += weight
            signals_hit.append({
                "id": signal.get("id", ""),
                "label": signal.get("label", ""),
                "weight": weight,
                "matched_patterns": patterns[:3],
            })
        else:
            signals_missed.append({
                "id": signal.get("id", ""),
                "label": signal.get("label", ""),
                "weight": weight,
            })

    # Score bonus signals
    for signal in profile.get("bonus", []):
        weight = signal.get("weight", 5)
        max_possible += weight
        matched, patterns = _check_signal(signal, text_lower)

        if matched:
            total_score += weight
            bonuses_hit.append({
                "id": signal.get("id", ""),
                "label": signal.get("label", ""),
                "weight": weight,
            })

    # Check dealbreakers
    has_leadership_signal = any(
        s["id"] in ("director_vp_level", "team_scale")
        for s in signals_hit
    )

    for signal in profile.get("dealbreakers", []):
        # IC role dealbreaker only applies if no leadership signals found
        if signal.get("id") == "ic_role" and has_leadership_signal:
            continue

        matched, patterns = _check_signal(signal, text_lower)
        if matched:
            penalty = signal.get("penalty", -20)
            total_score += penalty
            dealbreakers_hit.append({
                "id": signal.get("id", ""),
                "label": signal.get("label", ""),
                "penalty": penalty,
                "matched_patterns": patterns[:2],
            })

    # Determine tier
    thresholds = profile.get("thresholds", {})
    if total_score >= thresholds.get("bullseye", 75):
        tier = "bullseye"
    elif total_score >= thresholds.get("strong", 55):
        tier = "strong"
    elif total_score >= thresholds.get("maybe", 35):
        tier = "maybe"
    else:
        tier = "skip"

    return {
        "score": total_score,
        "max_possible": max_possible,
        "tier": tier,
        "signals_hit": signals_hit,
        "signals_missed": signals_missed,
        "bonuses_hit": bonuses_hit,
        "dealbreakers_hit": dealbreakers_hit,
    }


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

TIER_LABELS = {
    "bullseye": "BULLSEYE  - Apply immediately",
    "strong":   "STRONG    - Worth a close look",
    "maybe":    "MAYBE     - Skim the JD",
    "skip":     "SKIP      - Don't bother",
}

TIER_COLORS = {
    "bullseye": "\033[1;32m",  # bold green
    "strong":   "\033[1;33m",  # bold yellow
    "maybe":    "\033[0;36m",  # cyan
    "skip":     "\033[0;90m",  # gray
}
RESET = "\033[0m"


def print_result(result, title="", verbose=False):
    """Print a human-readable score result."""
    tier = result["tier"]
    color = TIER_COLORS.get(tier, "")
    label = TIER_LABELS.get(tier, tier)
    score = result["score"]
    max_p = result["max_possible"]

    if title:
        print(f"\n  {title}")
        print(f"  {'=' * len(title)}")

    print(f"\n  {color}{label}{RESET}  ({score}/{max_p} points)")

    if result["dealbreakers_hit"]:
        print("\n  DEALBREAKERS:")
        for db in result["dealbreakers_hit"]:
            print(f"    {db['label']} ({db['penalty']:+d})")

    if verbose or tier in ("bullseye", "strong"):
        if result["signals_hit"]:
            print("\n  Matched signals:")
            for s in result["signals_hit"]:
                print(f"    [+{s['weight']:2d}] {s['label']}")

        if result["signals_missed"]:
            print("\n  Missing signals:")
            for s in result["signals_missed"]:
                print(f"    [-{s['weight']:2d}] {s['label']}")

        if result["bonuses_hit"]:
            print("\n  Bonuses:")
            for b in result["bonuses_hit"]:
                print(f"    [+{b['weight']:2d}] {b['label']}")

    print()


# ---------------------------------------------------------------------------
# Scanning modes
# ---------------------------------------------------------------------------

def score_file(filepath, profile, verbose=False, as_json=False):
    """Score a single JD file."""
    path = Path(filepath)
    if not path.exists():
        print(f"ERROR: File not found: {filepath}")
        return None

    with open(path, encoding="utf-8") as f:
        text = f.read()

    result = score_jd(text, profile)

    if as_json:
        output = {**result, "file": str(path)}
        print(json.dumps(output, indent=2))
    else:
        title = path.stem.replace("-", " ").replace("_", " ").title()
        print_result(result, title=title, verbose=verbose)

    return result


def scan_pending(profile, verbose=False, as_json=False):
    """Scan all pending_review applications and rank them."""
    if not APPLICATIONS_DIR.exists():
        print("ERROR: No applications directory found.")
        return []

    results = []

    for app_dir in sorted(APPLICATIONS_DIR.iterdir()):
        if not app_dir.is_dir():
            continue

        meta_path = app_dir / "metadata.json"
        jd_path = app_dir / "job-description.md"

        if not meta_path.exists():
            continue

        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)

        # Score all applications (not just pending_review)
        if not jd_path.exists():
            continue

        with open(jd_path, encoding="utf-8") as f:
            jd_text = f.read()

        result = score_jd(jd_text, profile)
        result["company"] = meta.get("company", "")
        result["role"] = meta.get("role", "")
        result["folder"] = app_dir.name
        result["status"] = meta.get("status", "")
        results.append(result)

    # Sort by score descending
    results.sort(key=lambda r: r["score"], reverse=True)

    if as_json:
        print(json.dumps(results, indent=2))
    else:
        print(f"\n  {'=' * 60}")
        print(f"  BULLSEYE FILTER — {len(results)} applications scanned")
        print(f"  {'=' * 60}\n")

        for r in results:
            tier = r["tier"]
            color = TIER_COLORS.get(tier, "")
            score = r["score"]
            company = r["company"]
            role = r["role"]
            status = r["status"]
            display_company = company.encode("ascii", "replace").decode("ascii")
            display_role = role.encode("ascii", "replace").decode("ascii")
            print(f"  {color}[{score:3d}] {tier:9s}{RESET}  {display_company} -- {display_role}  ({status})")

            if verbose and r["signals_hit"]:
                hits = ", ".join(s["label"] for s in r["signals_hit"][:4])
                print(f"         Signals: {hits}")

            if r["dealbreakers_hit"]:
                dbs = ", ".join(d["label"] for d in r["dealbreakers_hit"])
                print(f"         Dealbreakers: {dbs}")

        # Summary by tier
        tier_counts = {}
        for r in results:
            tier_counts[r["tier"]] = tier_counts.get(r["tier"], 0) + 1

        print("\n  Summary:")
        for tier in ("bullseye", "strong", "maybe", "skip"):
            count = tier_counts.get(tier, 0)
            if count:
                print(f"    {tier:9s}: {count}")

    return results


def score_stdin(profile, verbose=False, as_json=False):
    """Score JD text from stdin."""
    text = sys.stdin.read()
    if not text.strip():
        print("ERROR: No input received on stdin.")
        return None

    result = score_jd(text, profile)

    if as_json:
        print(json.dumps(result, indent=2))
    else:
        print_result(result, title="(stdin)", verbose=verbose)

    return result


# ---------------------------------------------------------------------------
# Pipeline integration
# ---------------------------------------------------------------------------

def filter_for_pipeline(leads, profile):
    """Filter a list of scored leads, adding bullseye_tier to each.

    Called from job_score.py or email pipeline to flag high-value matches.
    Returns the leads list with bullseye_score and bullseye_tier added.
    """
    for lead in leads:
        description = lead.get("description_text", "")
        if not description:
            lead["bullseye_score"] = 0
            lead["bullseye_tier"] = "skip"
            continue

        result = score_jd(description, profile)
        lead["bullseye_score"] = result["score"]
        lead["bullseye_tier"] = result["tier"]
        lead["bullseye_signals"] = [s["id"] for s in result["signals_hit"]]

    return leads


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Quick-score JDs against your bullseye profile"
    )
    parser.add_argument("file", nargs="?", help="Path to a job-description.md file")
    parser.add_argument("--stdin", action="store_true", help="Read JD from stdin")
    parser.add_argument("--scan-pending", action="store_true",
                        help="Scan all applications in applications/")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show signal breakdown")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--profile", default=None, help="Path to bullseye profile YAML")
    args = parser.parse_args()

    profile = load_profile(args.profile)

    if args.stdin:
        score_stdin(profile, verbose=args.verbose, as_json=args.json)
    elif args.scan_pending:
        scan_pending(profile, verbose=args.verbose, as_json=args.json)
    elif args.file:
        score_file(args.file, verbose=args.verbose, as_json=args.json, profile=profile)
    else:
        parser.print_help()
        print("\n  Examples:")
        print("    python job_alert_filter.py applications/2026-03-06_.../job-description.md")
        print("    python job_alert_filter.py --scan-pending --verbose")
        print("    cat jd.txt | python job_alert_filter.py --stdin")


if __name__ == "__main__":
    main()
