"""Tests for scripts/backfill_archetypes.py."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import backfill_archetypes as bf


def _seed(tmp_path: Path, name: str, meta: dict, jd: str = "") -> Path:
    folder = tmp_path / "applications" / name
    folder.mkdir(parents=True)
    (folder / "metadata.json").write_text(json.dumps(meta), encoding="utf-8")
    if jd:
        (folder / "job-description.md").write_text(jd, encoding="utf-8")
    return folder


def test_metadata_dry_run_no_writes(tmp_path, monkeypatch):
    monkeypatch.setattr(bf, "APPLICATIONS_DIR", tmp_path / "applications")
    folder = _seed(tmp_path, "a1", {"company": "A", "role": "CTO"},
                   "HIPAA FHIR team leadership")
    stats = bf.backfill_metadata(dry_run=True)
    assert stats.updated == 1
    # file not modified
    meta = json.loads((folder / "metadata.json").read_text())
    assert "archetype" not in meta


def test_metadata_writes_archetype(tmp_path, monkeypatch):
    monkeypatch.setattr(bf, "APPLICATIONS_DIR", tmp_path / "applications")
    folder = _seed(tmp_path, "a1", {"company": "A", "role": "CTO"},
                   "HIPAA FHIR team leadership")
    stats = bf.backfill_metadata(dry_run=False)
    assert stats.updated == 1
    meta = json.loads((folder / "metadata.json").read_text())
    assert meta["archetype"] == "healthcare-ops"
    assert 0 < meta["archetype_confidence"] <= 1


def test_metadata_skips_already_classified(tmp_path, monkeypatch):
    monkeypatch.setattr(bf, "APPLICATIONS_DIR", tmp_path / "applications")
    _seed(tmp_path, "a1", {"company": "A", "role": "CTO", "archetype": "general"})
    stats = bf.backfill_metadata()
    assert stats.updated == 0
    assert stats.skipped_already_classified == 1


def test_metadata_force_reclassifies(tmp_path, monkeypatch):
    monkeypatch.setattr(bf, "APPLICATIONS_DIR", tmp_path / "applications")
    folder = _seed(tmp_path, "a1", {"company": "A", "role": "CTO", "archetype": "general"},
                   "HIPAA FHIR team leadership")
    stats = bf.backfill_metadata(force=True)
    assert stats.updated == 1
    meta = json.loads((folder / "metadata.json").read_text())
    assert meta["archetype"] == "healthcare-ops"


def test_metadata_skips_no_role(tmp_path, monkeypatch):
    monkeypatch.setattr(bf, "APPLICATIONS_DIR", tmp_path / "applications")
    _seed(tmp_path, "a1", {"company": "A"})
    stats = bf.backfill_metadata()
    assert stats.skipped_no_role == 1


def test_metadata_skips_bad_json(tmp_path, monkeypatch):
    monkeypatch.setattr(bf, "APPLICATIONS_DIR", tmp_path / "applications")
    (tmp_path / "applications" / "bad").mkdir(parents=True)
    (tmp_path / "applications" / "bad" / "metadata.json").write_text("{not json}", encoding="utf-8")
    stats = bf.backfill_metadata()
    assert stats.errors == 1


def test_supabase_mode_produces_payload(tmp_path):
    input_file = tmp_path / "rows.json"
    input_file.write_text(json.dumps([
        {"id": "uuid-1", "role": "CTO", "job_description": "HIPAA FHIR team leadership"},
        {"id": "uuid-2", "role": "Founding Engineer", "job_description": "seed-stage 0-to-1"},
    ]), encoding="utf-8")
    rows = bf.backfill_supabase(input_file)
    assert len(rows) == 2
    assert rows[0]["id"] == "uuid-1"
    assert rows[0]["archetype"] == "healthcare-ops"
    assert rows[1]["archetype"] == "founder-minded-ic"


def test_supabase_mode_skips_empty_role(tmp_path):
    input_file = tmp_path / "rows.json"
    input_file.write_text(json.dumps([
        {"id": "uuid-1", "role": "", "job_description": "x"},
        {"id": "uuid-2", "role": "CTO", "job_description": "HIPAA"},
    ]), encoding="utf-8")
    rows = bf.backfill_supabase(input_file)
    assert len(rows) == 1
    assert rows[0]["id"] == "uuid-2"


def test_main_exits_zero_on_metadata(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(bf, "APPLICATIONS_DIR", tmp_path / "applications")
    rc = bf.main(["--mode", "metadata", "--dry-run"])
    assert rc == 0


def test_main_supabase_without_input_fails(capsys):
    rc = bf.main(["--mode", "supabase"])
    assert rc == 2
