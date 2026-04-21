"""Unit + scenario tests for portal_scan.py."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import portal_scan


# ---------------------------------------------------------------------------
# Fetcher parsing (feed → Posting)
# ---------------------------------------------------------------------------

def _mock_response(payload):
    class R:
        def raise_for_status(self):
            pass

        def json(self):
            return payload

    return R()


def test_greenhouse_parse():
    with patch.object(portal_scan.requests, "get", return_value=_mock_response({
        "jobs": [{
            "id": 123,
            "title": "Senior Platform Engineer",
            "absolute_url": "https://boards.greenhouse.io/stripe/jobs/123",
            "location": {"name": "Remote"},
            "updated_at": "2026-04-15T10:00:00Z",
        }]
    })):
        results = portal_scan.fetch_greenhouse("stripe")
    assert len(results) == 1
    assert results[0].title == "Senior Platform Engineer"
    assert results[0].location == "Remote"
    assert results[0].external_id == "123"
    assert results[0].ats == "greenhouse"


def test_ashby_parse():
    with patch.object(portal_scan.requests, "get", return_value=_mock_response({
        "jobs": [{
            "id": "abc-def",
            "title": "ML Engineer",
            "jobUrl": "https://jobs.ashbyhq.com/openai/abc-def",
            "locationName": "San Francisco",
            "publishedDate": "2026-04-10T00:00:00.000Z",
            "departmentName": "AI Safety",
        }]
    })):
        results = portal_scan.fetch_ashby("openai")
    assert len(results) == 1
    assert results[0].department == "AI Safety"
    assert results[0].ats == "ashby"


def test_lever_parse():
    with patch.object(portal_scan.requests, "get", return_value=_mock_response([
        {
            "id": "lever-id",
            "text": "Director of Engineering",
            "hostedUrl": "https://jobs.lever.co/netflix/lever-id",
            "createdAt": 1742000000000,
            "categories": {"location": "Los Gatos", "department": "Engineering"},
        }
    ])):
        results = portal_scan.fetch_lever("netflix")
    assert len(results) == 1
    assert results[0].location == "Los Gatos"
    assert results[0].department == "Engineering"
    assert results[0].updated_at is not None


# ---------------------------------------------------------------------------
# Filter rules
# ---------------------------------------------------------------------------

def _filters(**overrides):
    import re as _re
    base = {
        "max_age_days": 30,
        "title_blocklist": [_re.compile(r"(?i)\bintern\b")],
        "title_allowlist": [],
        "location_blocklist": [],
    }
    base.update(overrides)
    return base


def test_filter_blocks_intern():
    p = portal_scan.Posting("Stripe", "greenhouse", "Software Engineer Intern", "url", "Remote", "2026-04-20T00:00:00Z", "1")
    keep, reason = portal_scan.filter_posting(p, _filters(), datetime.now(timezone.utc))
    assert not keep
    assert "blocklist" in reason


def test_filter_allows_senior():
    p = portal_scan.Posting("Stripe", "greenhouse", "Senior Software Engineer", "url", "Remote", "2026-04-20T00:00:00Z", "1")
    keep, _ = portal_scan.filter_posting(p, _filters(), datetime.now(timezone.utc))
    assert keep


def test_filter_drops_old_posting():
    old_iso = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    p = portal_scan.Posting("Stripe", "greenhouse", "Senior Engineer", "url", "Remote", old_iso, "1")
    keep, reason = portal_scan.filter_posting(p, _filters(max_age_days=30), datetime.now(timezone.utc))
    assert not keep
    assert "older than" in reason


# ---------------------------------------------------------------------------
# Dedup
# ---------------------------------------------------------------------------

def test_dedup_by_fingerprint():
    a = portal_scan.Posting("Stripe", "greenhouse", "SWE", "u1", "", None, "1")
    b = portal_scan.Posting("Stripe", "greenhouse", "SWE", "u1", "", None, "1")
    unique, dupes = portal_scan.dedup([a, b], set(), set())
    assert len(unique) == 1
    assert dupes == 1


def test_dedup_by_known_url():
    p = portal_scan.Posting("Stripe", "greenhouse", "SWE", "https://stripe.com/jobs/42", "", None, "42")
    unique, dupes = portal_scan.dedup([p], {"https://stripe.com/jobs/42"}, set())
    assert unique == []
    assert dupes == 1


def test_dedup_by_known_fingerprint():
    p = portal_scan.Posting("Stripe", "greenhouse", "SWE", "u", "", None, "99")
    fp = p.fingerprint()
    unique, dupes = portal_scan.dedup([p], set(), {fp})
    assert unique == []
    assert dupes == 1


# ---------------------------------------------------------------------------
# Staging
# ---------------------------------------------------------------------------

def test_stage_writes_jsonl(tmp_path, monkeypatch):
    monkeypatch.setattr(portal_scan, "STAGE_DIR", tmp_path / "staged")
    p = portal_scan.Posting("Stripe", "greenhouse", "SWE", "u", "R", "2026-04-20T00:00:00Z", "1")
    out = portal_scan.stage_postings([p], ts="20260420T000000Z")
    assert out.exists()
    content = json.loads(out.read_text(encoding="utf-8").strip())
    assert content["company"] == "Stripe"
    assert "fingerprint" in content


# ---------------------------------------------------------------------------
# Scenario: scan twice in a row, second run sees 0 new items
# ---------------------------------------------------------------------------

def test_scenario_rerun_produces_zero_dupes(tmp_path, monkeypatch):
    monkeypatch.setattr(portal_scan, "STAGE_DIR", tmp_path / "staged")
    monkeypatch.setattr(portal_scan, "APPLICATIONS_DIR", tmp_path / "apps")  # no apps

    # seed one posting as "previously staged"
    p = portal_scan.Posting("Stripe", "greenhouse", "SWE", "u", "R", "2026-04-20T00:00:00Z", "1")
    portal_scan.stage_postings([p], ts="20260420T000000Z")

    known_urls = portal_scan.load_known_urls()
    known_fps = portal_scan.load_known_fingerprints()
    assert p.fingerprint() in known_fps

    unique, dupes = portal_scan.dedup([p], known_urls, known_fps)
    assert unique == []
    assert dupes == 1


# ---------------------------------------------------------------------------
# Full-cycle verification: target-add → scan → staged
# ---------------------------------------------------------------------------

def test_full_cycle_target_to_stage(tmp_path, monkeypatch):
    config = tmp_path / "portal_targets.yaml"
    config.write_text(
        "targets:\n"
        "  - company: TestCo\n"
        "    ats: greenhouse\n"
        "    slug: testco\n"
        "    archetype_hints: [ai-applied]\n"
        "filter:\n"
        "  max_age_days: 365\n"
        "  title_blocklist: []\n"
        "  title_allowlist: []\n"
        "  location_blocklist: []\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(portal_scan, "STAGE_DIR", tmp_path / "staged")
    monkeypatch.setattr(portal_scan, "APPLICATIONS_DIR", tmp_path / "apps")

    fake_fetchers = dict(portal_scan.FETCHERS)
    fake_fetchers["greenhouse"] = lambda slug: [
        portal_scan.Posting("testco", "greenhouse", "Senior ML Eng", "https://testco/j/1", "Remote", "2026-04-20T00:00:00Z", "1")
    ]
    with patch.dict(portal_scan.FETCHERS, fake_fetchers, clear=True):
        postings, stats = portal_scan.scan(config_path=config)

    assert len(postings) == 1
    assert stats.postings_staged == 1
    assert postings[0].archetype_hints == ["ai-applied"]
    assert postings[0].company == "TestCo"
    # stage file exists with one line
    staged = list((tmp_path / "staged").glob("*.jsonl"))
    assert len(staged) == 1
    assert len(staged[0].read_text(encoding="utf-8").strip().splitlines()) == 1


def test_since_parser():
    assert portal_scan._parse_since("7d") == 7
    assert portal_scan._parse_since("2w") == 14
    assert portal_scan._parse_since("1m") == 30
    assert portal_scan._parse_since(None) is None
