"""Tests for scripts/doctor.py."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import doctor


def _result(status: str = doctor.GREEN) -> doctor.CheckResult:
    return doctor.CheckResult(name="fake", status=status, message="ok")


def test_color_fallback_plain_when_not_tty():
    with patch.object(doctor.sys.stdout, "isatty", return_value=False):
        assert doctor._color(doctor.GREEN).strip() == "OK"
        assert doctor._color(doctor.RED).strip() == "FAIL"


def test_exit_code_zero_when_all_green(capsys):
    fake_checks = {"one": lambda: _result(doctor.GREEN), "two": lambda: _result(doctor.YELLOW)}
    with patch.dict(doctor.ALL_CHECKS, fake_checks, clear=True):
        rc = doctor.main([])
    assert rc == 0


def test_exit_code_one_when_any_red():
    fake_checks = {"one": lambda: _result(doctor.GREEN), "two": lambda: _result(doctor.RED)}
    with patch.dict(doctor.ALL_CHECKS, fake_checks, clear=True):
        rc = doctor.main([])
    assert rc == 1


def test_unknown_check_name_returns_two():
    rc = doctor.main(["--only", "does-not-exist"])
    assert rc == 2


def test_json_output_is_valid(capsys):
    fake_checks = {"one": lambda: _result(doctor.GREEN)}
    with patch.dict(doctor.ALL_CHECKS, fake_checks, clear=True):
        doctor.main(["--json"])
    out = capsys.readouterr().out
    parsed = json.loads(out)
    assert parsed[0]["status"] == doctor.GREEN
    assert parsed[0]["name"] == "fake"


def test_check_crash_is_captured_as_red():
    def boom() -> doctor.CheckResult:
        raise RuntimeError("kaboom")

    result = doctor._time_check(boom)
    assert result.status == doctor.RED
    assert "kaboom" in result.message


def test_env_missing_local_is_red(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    (tmp_path / "apps" / "web").mkdir(parents=True)
    (tmp_path / "apps" / "web" / ".env.example").write_text("FOO=bar\n", encoding="utf-8")
    result = doctor.check_env()
    assert result.status == doctor.RED
    assert ".env.local missing" in result.message


def test_env_placeholder_is_yellow(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    web = tmp_path / "apps" / "web"
    web.mkdir(parents=True)
    (web / ".env.example").write_text("API_KEY=sk-ant-...\n", encoding="utf-8")
    (web / ".env.local").write_text("API_KEY=sk-ant-...\n", encoding="utf-8")
    result = doctor.check_env()
    assert result.status == doctor.YELLOW


def test_env_all_green(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    web = tmp_path / "apps" / "web"
    web.mkdir(parents=True)
    (web / ".env.example").write_text("API_KEY=sk-ant-...\n", encoding="utf-8")
    (web / ".env.local").write_text("API_KEY=sk-ant-actual-real-value-not-placeholder\n", encoding="utf-8")
    result = doctor.check_env()
    assert result.status == doctor.GREEN


def test_gmail_token_missing_is_yellow(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    result = doctor.check_gmail_token()
    assert result.status == doctor.YELLOW


def test_gmail_token_no_refresh_is_red(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    (tmp_path / "token.json").write_text(json.dumps({"access_token": "x"}), encoding="utf-8")
    result = doctor.check_gmail_token()
    assert result.status == doctor.RED


def test_gmail_token_cause_b_drift_is_red(tmp_path, monkeypatch):
    """Simulates the GOOGLE_CLIENT_SECRET drift memory documented."""
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    (tmp_path / "token.json").write_text(
        json.dumps({"refresh_token": "rt", "client_secret": "old-secret"}),
        encoding="utf-8",
    )
    web = tmp_path / "apps" / "web"
    web.mkdir(parents=True)
    (web / ".env.local").write_text("GOOGLE_CLIENT_SECRET=new-secret\n", encoding="utf-8")
    result = doctor.check_gmail_token()
    assert result.status == doctor.RED
    assert "Cause B" in result.message


def test_extension_version_parsed(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    ext = tmp_path / "apps" / "extension"
    ext.mkdir(parents=True)
    (ext / "manifest.json").write_text(json.dumps({"version": "1.2.3"}), encoding="utf-8")
    result = doctor.check_extension_version()
    assert result.status == doctor.GREEN
    assert "1.2.3" in result.message


def test_extension_bad_version(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    ext = tmp_path / "apps" / "extension"
    ext.mkdir(parents=True)
    (ext / "manifest.json").write_text(json.dumps({"version": "not-semver"}), encoding="utf-8")
    result = doctor.check_extension_version()
    assert result.status == doctor.RED


def test_scoring_sync_green_when_all_present(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    (tmp_path / "packages" / "scoring-rules").mkdir(parents=True)
    (tmp_path / "packages" / "scoring-rules" / "scoring-rules.yaml").write_text(
        "version: 1\n", encoding="utf-8"
    )
    (tmp_path / "job_score.py").write_text("# reads scoring-rules.yaml\n", encoding="utf-8")
    (tmp_path / "apps" / "web" / "src" / "scoring").mkdir(parents=True)
    (tmp_path / "apps" / "web" / "src" / "scoring" / "calculate-score.ts").write_text(
        "export const v = 1;\n", encoding="utf-8"
    )
    result = doctor.check_scoring_sync()
    assert result.status == doctor.GREEN


def test_scoring_sync_red_when_py_missing_ref(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "REPO_ROOT", tmp_path)
    (tmp_path / "packages" / "scoring-rules").mkdir(parents=True)
    (tmp_path / "packages" / "scoring-rules" / "scoring-rules.yaml").write_text(
        "version: 1\n", encoding="utf-8"
    )
    (tmp_path / "job_score.py").write_text("# nothing here\n", encoding="utf-8")
    (tmp_path / "apps" / "web" / "src" / "scoring").mkdir(parents=True)
    (tmp_path / "apps" / "web" / "src" / "scoring" / "calculate-score.ts").write_text("", encoding="utf-8")
    result = doctor.check_scoring_sync()
    assert result.status == doctor.RED
