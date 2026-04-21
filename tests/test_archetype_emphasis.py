"""
Structural tests for skills/resume-tailor/references/archetype-emphasis.md.

The skill depends on this file to do archetype-driven reordering. These tests
enforce the contract:
- Every archetype from archetypes.yaml has a section here
- Every section has the required subsections
- Keyword lists are non-empty
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
EMPHASIS_MD = REPO_ROOT / "skills" / "resume-tailor" / "references" / "archetype-emphasis.md"

sys.path.insert(0, str(REPO_ROOT / "packages" / "scoring-rules"))
import classify_archetype as ca  # type: ignore  # noqa: E402


def test_emphasis_file_exists():
    assert EMPHASIS_MD.exists()


def _section_headers(text: str) -> list[str]:
    return re.findall(r"^## ([a-z\-]+)$", text, flags=re.MULTILINE)


def test_every_archetype_has_a_section():
    config = ca.load_config()
    yaml_archetypes = set(config["archetypes"].keys())
    md_text = EMPHASIS_MD.read_text(encoding="utf-8")
    md_sections = set(_section_headers(md_text))
    missing = yaml_archetypes - md_sections
    assert not missing, f"emphasis doc missing sections for: {missing}"


def test_each_archetype_section_has_required_subsections():
    md_text = EMPHASIS_MD.read_text(encoding="utf-8")
    config = ca.load_config()
    # Split by ## headers and check each archetype chunk
    chunks = re.split(r"^## ([a-z\-]+)\n", md_text, flags=re.MULTILINE)
    # chunks[0] is prefix; then alternating name, body, name, body, ...
    sections = dict(zip(chunks[1::2], chunks[2::2]))
    for archetype_name in config["archetypes"]:
        body = sections.get(archetype_name, "")
        assert body, f"no body for {archetype_name}"
        assert "**Lead with:**" in body, f"{archetype_name} missing 'Lead with:'"
        assert "**Keyword priority (top 3 in summary):**" in body, (
            f"{archetype_name} missing 'Keyword priority'"
        )


def test_has_usage_section():
    md_text = EMPHASIS_MD.read_text(encoding="utf-8")
    assert "## How the resume-tailor skill uses this" in md_text


def test_skill_references_emphasis_doc():
    skill_md = REPO_ROOT / "skills" / "resume-tailor" / "SKILL.md"
    text = skill_md.read_text(encoding="utf-8")
    assert "archetype-emphasis.md" in text
    assert "metadata.archetype" in text or "metadata.json" in text
