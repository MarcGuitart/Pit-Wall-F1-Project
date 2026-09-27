"""
The commit message a publication run produces.

Two races and nineteen races are one commit each, and the subject cannot be the
same shape for both: nineteen labels joined by commas is a subject nobody reads.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
spec = importlib.util.spec_from_file_location("publish_commit_message",
                                              SCRIPTS / "publish_commit_message.py")
mod = importlib.util.module_from_spec(spec)
sys.modules["publish_commit_message"] = mod
spec.loader.exec_module(mod)


def published(*labels: str) -> list[dict]:
    return [{"session_key": 11234 + i, "label": label} for i, label in enumerate(labels)]


def test_one_race_names_it_in_the_subject():
    out = mod.message(published("Baku 2026 · Race"))
    assert out == "feat(cache): publish Baku 2026 · Race [skip ci]"


def test_the_hourly_pair_names_both():
    out = mod.message(published("Melbourne 2026 · Race", "Shanghai 2026 · Sprint"))
    assert "Melbourne 2026 · Race, Shanghai 2026 · Sprint" in out
    assert "\n" not in out


def test_a_backfill_counts_in_the_subject_and_lists_in_the_body():
    labels = [f"Circuit{i} 2026 · Race" for i in range(19)]
    out = mod.message(published(*labels))
    subject, body = out.split("\n", 1)

    assert subject == "feat(cache): backfill 19 sessions [skip ci]"
    assert len(subject) < 72, "a subject a git log can show"
    for label in labels:
        assert f"- {label}" in body, label


def test_every_message_carries_skip_ci_and_only_in_the_subject():
    for count in (0, 1, 2, 3, 19):
        out = mod.message(published(*[f"R{i}" for i in range(count)]))
        subject = out.split("\n", 1)[0]
        assert subject.endswith("[skip ci]"), count
        assert out.count("[skip ci]") == 1, count
        assert "[skip render]" not in out, "Render must still deploy"


def test_nothing_published_still_produces_a_usable_subject():
    assert mod.message([]).startswith("feat(cache): publish")


def test_a_session_with_no_label_falls_back_to_its_key():
    assert "session 11377" in mod.message([{"session_key": 11377}])


def test_an_unreadable_report_does_not_fail_the_commit(tmp_path, capsys, monkeypatch):
    """
    A run that computed nineteen analyses must not lose them because the report
    file could not be read.
    """
    monkeypatch.setattr(sys, "argv", ["x", str(tmp_path / "missing.json")])
    assert mod.main() == 0
    assert capsys.readouterr().out.startswith("feat(cache): publish")


def test_the_script_reads_a_real_report(tmp_path, capsys, monkeypatch):
    report = tmp_path / "report.json"
    report.write_text(json.dumps({"published": published("Monza 2026 · Race"), "limit": 0}))
    monkeypatch.setattr(sys, "argv", ["x", str(report)])
    assert mod.main() == 0
    assert "Monza 2026 · Race" in capsys.readouterr().out
