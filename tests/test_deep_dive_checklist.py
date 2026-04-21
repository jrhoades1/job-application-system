"""Structural tests for skills/company-research/references/deep-dive-checklist.md."""
from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CHECKLIST = REPO_ROOT / "skills" / "company-research" / "references" / "deep-dive-checklist.md"
SKILL_MD = REPO_ROOT / "skills" / "company-research" / "SKILL.md"


def test_checklist_exists():
    assert CHECKLIST.exists()


def test_has_eight_sections():
    text = CHECKLIST.read_text(encoding="utf-8")
    sections = re.findall(r"^## Section \d+ —", text, flags=re.MULTILINE)
    assert len(sections) == 8


def test_risk_flags_section_is_mandatory():
    text = CHECKLIST.read_text(encoding="utf-8")
    assert "NEVER skip" in text
    assert "Section 8" in text


def test_every_research_section_has_queries_block():
    """Sections 1-7 are web-research sections; 8 is a checklist scan."""
    text = CHECKLIST.read_text(encoding="utf-8")
    chunks = re.split(r"^## Section \d+ — ", text, flags=re.MULTILINE)[1:]
    assert len(chunks) == 8
    for i, chunk in enumerate(chunks[:7], start=1):  # Sections 1-7
        assert "**Queries:**" in chunk or "**Targets:**" in chunk, (
            f"Section {i} missing Queries/Targets block"
        )
    # Section 8 (Risk Flags) is a scan, not a query set — check it has risk indicators
    assert "Layoffs" in chunks[7] or "regulatory" in chunks[7]


def test_synthesis_instructions_present():
    text = CHECKLIST.read_text(encoding="utf-8")
    assert "## Synthesis Instructions" in text
    assert "company-brief.md" in text
    assert "Interview opening line" in text


def test_skill_references_checklist():
    text = SKILL_MD.read_text(encoding="utf-8")
    assert "deep-dive-checklist.md" in text
    assert "Deep mode" in text or "deep" in text


def test_deep_mode_maps_to_specific_archetypes():
    """The deep mode should be triggered by specific archetypes."""
    text = SKILL_MD.read_text(encoding="utf-8")
    assert "engineering-leadership" in text or "ai-applied" in text


def test_output_format_blocks_use_fenced_code():
    """Each section should give a concrete output format for parseability."""
    text = CHECKLIST.read_text(encoding="utf-8")
    # At minimum 4 fenced blocks for funding/press/leadership/blog
    fenced = re.findall(r"```", text)
    # Every opening ``` has a closing — count pairs
    assert len(fenced) >= 8 and len(fenced) % 2 == 0
