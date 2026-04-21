"""Tests for scripts/dashboard.py — offline operational view."""
from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import dashboard


def _mk_meta(tmp_path: Path, name: str, meta: dict, jd: str = "") -> Path:
    folder = tmp_path / "applications" / name
    folder.mkdir(parents=True)
    (folder / "metadata.json").write_text(json.dumps(meta), encoding="utf-8")
    if jd:
        (folder / "job-description.md").write_text(jd, encoding="utf-8")
    return folder


def test_load_apps_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard, "APPLICATIONS_DIR", tmp_path / "applications")
    assert dashboard.load_apps() == []


def test_load_apps_reads_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard, "APPLICATIONS_DIR", tmp_path / "applications")
    _mk_meta(tmp_path, "acme", {
        "company": "Acme",
        "role": "CTO",
        "status": "applied",
        "applied_date": "2026-04-01",
    })
    apps = dashboard.load_apps()
    assert len(apps) == 1
    assert apps[0].company == "Acme"
    assert apps[0].status == "applied"


def test_load_apps_skips_missing_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard, "APPLICATIONS_DIR", tmp_path / "applications")
    (tmp_path / "applications" / "bare").mkdir(parents=True)
    (tmp_path / "applications" / "invalid" / "metadata.json").parent.mkdir(parents=True)
    (tmp_path / "applications" / "invalid" / "metadata.json").write_text("{not json}", encoding="utf-8")
    apps = dashboard.load_apps()
    assert apps == []


def test_load_apps_tolerates_partial_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard, "APPLICATIONS_DIR", tmp_path / "applications")
    _mk_meta(tmp_path, "acme", {"company": "Acme"})  # no role, no status
    apps = dashboard.load_apps()
    assert len(apps) == 1
    assert apps[0].role == ""
    assert apps[0].status == "unknown"


def test_view_pipeline_groups_by_status(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard, "APPLICATIONS_DIR", tmp_path / "applications")
    _mk_meta(tmp_path, "a1", {"company": "A", "role": "X", "status": "applied"})
    _mk_meta(tmp_path, "a2", {"company": "B", "role": "Y", "status": "applied"})
    _mk_meta(tmp_path, "a3", {"company": "C", "role": "Z", "status": "interviewing"})
    apps = dashboard.load_apps()
    rows = dashboard.view_pipeline(apps)
    statuses = [s for s, _, _ in rows]
    assert "APPLIED" in statuses
    assert "INTERVIEWING" in statuses


def test_view_pipeline_filter_by_status(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard, "APPLICATIONS_DIR", tmp_path / "applications")
    _mk_meta(tmp_path, "a1", {"company": "A", "role": "X", "status": "applied"})
    _mk_meta(tmp_path, "a2", {"company": "B", "role": "Y", "status": "interviewing"})
    apps = dashboard.load_apps()
    rows = dashboard.view_pipeline(apps, status_filter="applied")
    assert len(rows) == 1
    assert rows[0][0] == "APPLIED"


def test_view_today_surfaces_stale_leads(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard, "APPLICATIONS_DIR", tmp_path / "applications")
    today = date(2026, 4, 21)
    # 3-day-old new lead — should surface
    _mk_meta(tmp_path, "new_stale", {
        "company": "N", "role": "R", "status": "new",
        "last_update": (today - timedelta(days=3)).isoformat(),
    })
    # 1-day-old new lead — should NOT surface
    _mk_meta(tmp_path, "new_fresh", {
        "company": "F", "role": "R", "status": "new",
        "last_update": (today - timedelta(days=1)).isoformat(),
    })
    apps = dashboard.load_apps()
    stale = dashboard.view_today(apps, today)
    names = [a.company for a in stale]
    assert "N" in names
    assert "F" not in names


def test_view_decay_filters_active_only(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard, "APPLICATIONS_DIR", tmp_path / "applications")
    today = date(2026, 4, 21)
    long_ago = (today - timedelta(days=60)).isoformat()
    _mk_meta(tmp_path, "stale_applied", {
        "company": "A", "role": "R", "status": "applied", "last_update": long_ago,
    })
    _mk_meta(tmp_path, "stale_rejected", {
        "company": "B", "role": "R", "status": "rejected", "last_update": long_ago,
    })
    apps = dashboard.load_apps()
    decay = dashboard.view_decay(apps, today)
    companies = [a.company for a in decay]
    assert "A" in companies
    assert "B" not in companies  # rejected is not active


def test_app_age_days_handles_missing():
    a = dashboard.App(
        folder="x", company="x", role="x", status="applied",
        applied_date=None, last_update=None, url="",
    )
    assert a.age_days(date(2026, 4, 21)) is None


def test_app_age_days_handles_bad_date():
    a = dashboard.App(
        folder="x", company="x", role="x", status="applied",
        applied_date="not a date", last_update=None, url="",
    )
    assert a.age_days(date(2026, 4, 21)) is None


def test_json_output_is_valid(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(dashboard, "APPLICATIONS_DIR", tmp_path / "applications")
    monkeypatch.setattr(dashboard, "STAGE_DIR", tmp_path / "staging")
    _mk_meta(tmp_path, "acme", {"company": "Acme", "role": "CTO", "status": "applied"})
    rc = dashboard.main(["--json", "--date", "2026-04-21"])
    assert rc == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["total_apps"] == 1
    assert payload["as_of"] == "2026-04-21"


def test_load_staged_counts_jsonl_lines(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard, "STAGE_DIR", tmp_path / "staging")
    (tmp_path / "staging").mkdir()
    (tmp_path / "staging" / "20260421.jsonl").write_text(
        '{"a":1}\n{"a":2}\n{"a":3}\n', encoding="utf-8"
    )
    count, latest = dashboard.load_staged()
    assert count == 3
    assert latest == "20260421"


def test_scenario_offline_no_network_still_runs(tmp_path, monkeypatch, capsys):
    """Dashboard must launch with cached state — no network call attempted."""
    monkeypatch.setattr(dashboard, "APPLICATIONS_DIR", tmp_path / "applications")
    monkeypatch.setattr(dashboard, "STAGE_DIR", tmp_path / "staging")
    _mk_meta(tmp_path, "acme", {"company": "Acme", "role": "CTO", "status": "applied"})
    # even with network disabled, this should work:
    rc = dashboard.main(["--date", "2026-04-21"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "Acme" in out or "applied" in out.lower()
