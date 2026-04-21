"""Tests for scripts/batch_score.py parallel scoring additions."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import batch_score as bs


# ---------------------------------------------------------------------------
# _parse_workers
# ---------------------------------------------------------------------------

def test_parse_workers_defaults_to_one():
    assert bs._parse_workers(["script"]) == 1


def test_parse_workers_accepts_space_separated():
    assert bs._parse_workers(["script", "--workers", "8"]) == 8


def test_parse_workers_accepts_equals_form():
    assert bs._parse_workers(["script", "--workers=4"]) == 4


def test_parse_workers_rejects_negative():
    with pytest.raises(SystemExit):
        bs._parse_workers(["script", "--workers", "-1"])


def test_parse_workers_rejects_too_high():
    with pytest.raises(SystemExit):
        bs._parse_workers(["script", "--workers", "64"])


def test_parse_workers_rejects_non_int():
    with pytest.raises(SystemExit):
        bs._parse_workers(["script", "--workers", "eight"])


# ---------------------------------------------------------------------------
# score_one_app — pure function, thread-safe
# ---------------------------------------------------------------------------

def test_score_one_app_returns_score_payload():
    app = {
        "id": "abc",
        "company": "TestCo",
        "role": "Staff Engineer",
        "job_description": (
            "Responsibilities:\n"
            "- Build scalable microservices\n"
            "- Lead technical architecture decisions\n"
            "- Mentor junior engineers\n"
            "\nRequirements:\n"
            "- 10+ years of software engineering experience\n"
            "- Experience with AWS and microservices\n"
            "- Strong leadership and communication skills\n"
        ),
    }
    result = bs.score_one_app(app)
    assert result is not None
    assert result["overall"] in {"strong", "good", "stretch", "long_shot"}
    assert 0 <= result["match_percentage"] <= 100
    assert "_reqs_count" in result and result["_reqs_count"] > 0


def test_score_one_app_returns_none_when_no_requirements():
    app = {
        "id": "abc",
        "company": "x",
        "role": "y",
        "job_description": "Cookies and milk.",  # no requirements extractable
    }
    result = bs.score_one_app(app)
    assert result is None


def test_score_one_app_is_deterministic():
    app = {
        "id": "abc",
        "company": "TestCo",
        "role": "Staff Engineer",
        "job_description": "Requirements:\n- 5+ years Python\n- Lead teams\n- AWS\n",
    }
    r1 = bs.score_one_app(app)
    r2 = bs.score_one_app(app)
    assert r1 == r2


# ---------------------------------------------------------------------------
# Parallel path equivalence — parallel output matches serial output on same input
# ---------------------------------------------------------------------------

def test_parallel_produces_same_scores_as_serial(monkeypatch):
    """Running the same set of apps serially and in parallel should yield
    the same score payloads (order may differ)."""
    apps = [
        {
            "id": f"app-{i}",
            "company": f"Co{i}",
            "role": "Senior Platform Engineer",
            "job_description": (
                "Requirements:\n"
                "- Strong Python experience\n"
                "- Kubernetes production experience\n"
                "- Leadership experience\n"
            ),
        }
        for i in range(8)
    ]

    serial_scores = {a["id"]: bs.score_one_app(a) for a in apps}

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=4) as ex:
        parallel_scores = {
            a["id"]: r
            for a, r in zip(apps, ex.map(bs.score_one_app, apps))
        }

    assert serial_scores == parallel_scores


def test_upsert_score_signature_unchanged():
    """Parallel path still calls upsert_score(app_id, dict) — make sure
    refactoring didn't change the contract."""
    assert callable(bs.upsert_score)
    # inspect signature
    import inspect
    sig = inspect.signature(bs.upsert_score)
    params = list(sig.parameters.keys())
    assert params[:2] == ["app_id", "score_data"]
