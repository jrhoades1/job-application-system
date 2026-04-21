"""
Archetype classifier — heuristic routing of job descriptions to role archetypes.

Reads packages/scoring-rules/archetypes.yaml and returns the best-matching
archetype along with a confidence score. Used by job_score.py to apply
archetype-specific strictness to the scoring bands.

The TypeScript mirror lives at apps/web/src/scoring/classify-archetype.ts.
Keep the two in sync.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    yaml = None

DEFAULT_CONFIG = Path(__file__).resolve().parent / "archetypes.yaml"


@dataclass
class Classification:
    archetype: str
    label: str
    confidence: float
    strictness: float
    matched_signals: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "archetype": self.archetype,
            "label": self.label,
            "confidence": round(self.confidence, 3),
            "strictness": self.strictness,
            "matched_signals": self.matched_signals,
        }


def load_config(path: Path | None = None) -> dict:
    if yaml is None:
        raise RuntimeError("PyYAML required for archetype classifier")
    cfg_path = path or DEFAULT_CONFIG
    if not cfg_path.exists():
        raise FileNotFoundError(f"archetypes config missing: {cfg_path}")
    with cfg_path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _score_archetype(name: str, rules: dict, title: str, jd: str) -> tuple[float, list[str]]:
    """Return (score 0-1, matched signal names) for a single archetype."""
    signals: list[str] = []
    hits = 0.0
    total_weight = 0.0

    # Title patterns — weight 0.5 (most specific)
    title_patterns = rules.get("title_patterns", []) or []
    if title_patterns:
        total_weight += 0.5
        for pat in title_patterns:
            if re.search(pat, title):
                hits += 0.5
                signals.append(f"title:{pat[:40]}")
                break

    # Required keywords — weight 0.4
    required = rules.get("required_keywords", []) or []
    if required:
        total_weight += 0.4
        for pat in required:
            if re.search(pat, jd):
                hits += 0.4
                signals.append(f"keyword:{pat[:40]}")
                break

    # Disqualifiers — any hit zeroes the score
    disq = rules.get("disqualifiers", []) or []
    for pat in disq:
        if re.search(pat, jd) or re.search(pat, title):
            return (0.0, [f"disqualified:{pat[:40]}"])

    if total_weight == 0:
        return (0.0, signals)
    return (hits / total_weight, signals)


def classify_archetype(
    title: str,
    jd_text: str = "",
    hints: list[str] | None = None,
    config: dict | None = None,
) -> Classification:
    """
    Classify a job description into an archetype.

    Args:
        title: Job title (most important signal)
        jd_text: Full job description text
        hints: Optional pre-labels from portal_targets.yaml (e.g. ["ai-applied"])
        config: Pre-loaded config (for testing); falls back to archetypes.yaml
    """
    cfg = config if config is not None else load_config()
    min_conf = float(cfg.get("min_confidence", 0.6))
    archetypes = cfg.get("archetypes", {})
    fallback = cfg.get("fallback", {"label": "General", "strictness": 1.0})

    title = title or ""
    jd = jd_text or ""

    # If hints are provided and score >= threshold for that specific hint, use it.
    candidates: list[tuple[str, float, list[str]]] = []
    hint_set = set(hints or [])

    for name, rules in archetypes.items():
        score, signals = _score_archetype(name, rules, title, jd)
        if name in hint_set and score > 0:
            # Pre-label from portal_targets adds 0.15 boost, capped at 1.0
            score = min(1.0, score + 0.15)
            signals = signals + [f"hint:{name}"]
        candidates.append((name, score, signals))

    # Sort by (score DESC, priority DESC) — niche archetypes beat generic ones
    # on ties so "Founding AI Engineer" routes to founder-minded-ic and a
    # healthcare CTO routes to healthcare-ops, not generic leadership.
    def _priority(name: str) -> int:
        return int(archetypes.get(name, {}).get("priority", 0))

    candidates.sort(key=lambda c: (c[1], _priority(c[0])), reverse=True)
    best_name, best_score, best_signals = candidates[0]

    if best_score < min_conf:
        return Classification(
            archetype="general",
            label=fallback.get("label", "General"),
            confidence=best_score,
            strictness=float(fallback.get("strictness", 1.0)),
            matched_signals=best_signals,
        )

    best_rules = archetypes[best_name]
    return Classification(
        archetype=best_name,
        label=best_rules.get("label", best_name),
        confidence=best_score,
        strictness=float(best_rules.get("strictness", 1.0)),
        matched_signals=best_signals,
    )


def apply_archetype_to_bands(match_pct: float, gap_count: int, strictness: float) -> str:
    """
    Given a raw match_pct (0-1) and gap count, return the score band,
    adjusted by the archetype's strictness multiplier.

    strictness 1.0 = base bands (0.8 / 0.6 / 0.4)
    strictness 1.1 = stricter bands (0.88 / 0.66 / 0.44)
    strictness 0.9 = more lenient (0.72 / 0.54 / 0.36)
    """
    # Round to 4 decimal places to avoid float-precision edge cases
    # (e.g., 0.8 * 1.1 = 0.8800000000000001, blocking match_pct = 0.88).
    strong_t = round(0.8 * strictness, 4)
    good_t = round(0.6 * strictness, 4)
    stretch_t = round(0.4 * strictness, 4)

    if match_pct >= strong_t and gap_count == 0:
        return "strong"
    if match_pct >= good_t and gap_count <= 1:
        return "good"
    if match_pct >= stretch_t and gap_count <= 2:
        return "stretch"
    return "long_shot"
