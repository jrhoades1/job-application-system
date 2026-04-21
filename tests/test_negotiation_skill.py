"""Structural + quality tests for skills/negotiation-coach."""
from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SKILL_DIR = REPO_ROOT / "skills" / "negotiation-coach"
SKILL_MD = SKILL_DIR / "SKILL.md"
FRAMEWORKS_MD = SKILL_DIR / "references" / "negotiation-frameworks.md"


def test_skill_md_exists():
    assert SKILL_MD.exists()


def test_references_exists():
    assert FRAMEWORKS_MD.exists()


def test_skill_md_has_valid_frontmatter():
    text = SKILL_MD.read_text(encoding="utf-8")
    assert text.startswith("---\n")
    end = text.find("\n---\n", 4)
    assert end != -1
    fm = text[4:end]
    assert "name: negotiation-coach" in fm
    assert "description:" in fm
    assert "recommended_model:" in fm


def test_skill_md_recommends_opus():
    text = SKILL_MD.read_text(encoding="utf-8")
    assert "default: opus" in text


def test_skill_md_has_required_sections():
    text = SKILL_MD.read_text(encoding="utf-8")
    for section in [
        "## Intent",
        "## When to use",
        "## Inputs",
        "## Outputs",
        "### 1. Red Flags",
        "### 2. BATNA Table",
        "### 3. Three Script Variants",
        "### 4. Rebuttal Prep",
        "### 5. Walk-Away Criteria",
    ]:
        assert section in text, f"missing section: {section}"


def test_skill_md_has_exactly_three_variants():
    text = SKILL_MD.read_text(encoding="utf-8")
    variant_headers = re.findall(r"#### Variant [ABC]:", text)
    assert len(variant_headers) == 3


def test_no_em_dashes_in_script_templates():
    """Jimmy's rule — em dashes read as AI-generated in high-stakes emails."""
    text = SKILL_MD.read_text(encoding="utf-8")
    # Find every triple-backtick block and assert no em dashes inside.
    blocks = re.findall(r"```(.*?)```", text, flags=re.DOTALL)
    assert blocks, "no code blocks found"
    for i, block in enumerate(blocks):
        assert "\u2014" not in block, f"em dash in code block {i}: {block[:80]!r}"


def test_scripts_have_placeholders_for_personalization():
    text = SKILL_MD.read_text(encoding="utf-8")
    blocks = re.findall(r"```(.*?)```", text, flags=re.DOTALL)
    # Each of the three variants should have [Name] + $[ pattern
    script_blocks = [b for b in blocks if "Hi [Recruiter]" in b]
    assert len(script_blocks) >= 3
    for block in script_blocks:
        assert "[Name]" in block, "script missing [Name] placeholder"
        assert "$[" in block or "$" in block, "script missing compensation placeholder"


def test_frameworks_reference_has_12_sections():
    text = FRAMEWORKS_MD.read_text(encoding="utf-8")
    headers = re.findall(r"^## \d+\.", text, flags=re.MULTILINE)
    assert len(headers) >= 12


def test_red_flags_list_covers_exploding_offers():
    text = SKILL_MD.read_text(encoding="utf-8")
    for flag in ["Exploding offer", "Verbal-only terms", "Below-band equity", "Claw-back"]:
        assert flag in text, f"red flag missing: {flag}"


def test_walk_away_criteria_has_thresholds():
    text = SKILL_MD.read_text(encoding="utf-8")
    walk_section = text[text.index("### 5. Walk-Away"):]
    assert "$X" in walk_section or "$" in walk_section
