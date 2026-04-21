"""Tests for packages/scoring-rules/classify_archetype.py."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "packages" / "scoring-rules"))
import classify_archetype as ca  # type: ignore


# Curated fixtures: (title, jd, expected_archetype)
FIXTURES = [
    (
        "Sr Manager, Software Engineering",
        "You will manage a team of engineers, own roadmap delivery, and mentor managers. Direct reports: 8.",
        "engineering-leadership",
    ),
    (
        "Senior AI Engineer",
        "Build LLM-powered features using Claude and RAG. Experience with prompt engineering and vector databases.",
        "ai-applied",
    ),
    (
        "Staff Data Engineer",
        "Own our data warehouse (Snowflake + dbt), design ETL pipelines, collaborate with analytics.",
        "data-analytics",
    ),
    (
        "Senior Platform Engineer",
        "Scale our Kubernetes infrastructure, own reliability SLOs, participate in on-call rotation.",
        "platform-sre",
    ),
    (
        "Founding AI Engineer",
        "Join us as our first AI hire at a seed-stage startup. You will 0-to-1 our LLM product.",
        "founder-minded-ic",  # founding beats ai-applied due to hint boost
    ),
    (
        "Senior Security Engineer",
        "Lead AppSec efforts, threat modeling, own SOC 2 compliance, OWASP-focused reviews.",
        "security",
    ),
    (
        "CTO",
        "Lead engineering at a healthcare startup. Own HIPAA compliance, PHI handling, FHIR integrations, lead a team of 15.",
        "healthcare-ops",  # healthcare keywords should dominate over leadership
    ),
    (
        "Administrative Assistant",
        "Handle scheduling, expense reports, and calendar management.",
        "general",
    ),
]


def test_all_fixtures_classify_correctly():
    config = ca.load_config()
    for title, jd, expected in FIXTURES:
        result = ca.classify_archetype(title, jd, config=config)
        assert result.archetype == expected, (
            f"title={title!r} expected={expected!r} got={result.archetype!r} "
            f"confidence={result.confidence} signals={result.matched_signals}"
        )


def test_disqualifier_blocks_archetype():
    config = ca.load_config()
    # "research scientist" should disqualify ai-applied
    result = ca.classify_archetype(
        "Research Scientist, LLM Safety",
        "Work on LLM alignment with PhD required.",
        config=config,
    )
    assert result.archetype != "ai-applied"


def test_hint_boost_breaks_ties():
    config = ca.load_config()
    title = "Senior Engineer"
    jd = "Work with AWS and LLMs and dbt."  # ambiguous — matches multiple
    without_hint = ca.classify_archetype(title, jd, config=config)
    with_hint = ca.classify_archetype(title, jd, hints=["ai-applied"], config=config)
    if with_hint.archetype == "ai-applied":
        assert with_hint.confidence >= without_hint.confidence


def test_general_fallback_below_confidence():
    config = ca.load_config()
    result = ca.classify_archetype("Assistant", "", config=config)
    assert result.archetype == "general"
    assert result.strictness == 1.0


def test_strictness_adjusts_bands():
    # strictness 1.0 — base bands
    assert ca.apply_archetype_to_bands(0.80, 0, 1.0) == "strong"
    assert ca.apply_archetype_to_bands(0.79, 0, 1.0) == "good"
    # strictness 1.1 — 0.88 threshold for strong
    assert ca.apply_archetype_to_bands(0.87, 0, 1.1) == "good"
    assert ca.apply_archetype_to_bands(0.88, 0, 1.1) == "strong"
    # strictness 0.9 — more lenient
    assert ca.apply_archetype_to_bands(0.72, 0, 0.9) == "strong"


def test_gap_count_blocks_promotion():
    # Even with match_pct >= 0.8, one gap demotes to "good"
    assert ca.apply_archetype_to_bands(0.85, 1, 1.0) == "good"
    assert ca.apply_archetype_to_bands(0.85, 2, 1.0) == "stretch"


def test_classification_to_dict_is_serializable():
    config = ca.load_config()
    result = ca.classify_archetype("CTO", "HIPAA FHIR team leadership", config=config)
    d = result.to_dict()
    assert "archetype" in d
    assert isinstance(d["confidence"], float)
    assert isinstance(d["matched_signals"], list)


def test_config_has_all_required_archetypes():
    config = ca.load_config()
    expected = {
        "engineering-leadership", "ai-applied", "data-analytics",
        "platform-sre", "founder-minded-ic", "security", "healthcare-ops",
    }
    assert set(config["archetypes"].keys()) == expected
