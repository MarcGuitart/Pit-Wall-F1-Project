"""
The Telegram notification. It must never fail a run, never send noise, and never
leak the bot token.

scripts/ is not a package, so it is loaded by path — the same thing the workflow
does when it calls `python scripts/notify_telegram.py`.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "notify_telegram.py"


def load():
    spec = importlib.util.spec_from_file_location("notify_telegram", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def nt():
    return load()


PUBLISHED = {
    "published": [{
        "session_key": 11377, "label": "Baku 2026 · Race",
        "meeting_name": "Azerbaijan Grand Prix", "session_name": "Race", "year": 2026,
        "winner": "RUS", "winner_grid": 2,
        "chaos_score": 73, "chaos_level": "Extreme", "modules_failed": [],
        "url": "https://pitwallengineer.com/race/11377",
    }],
    "stuck": [], "errors": [], "deferred": [],
}
ENV = {"RUN_URL": "https://github.com/o/r/actions/runs/1",
       "ISSUES_URL": "https://github.com/o/r/issues", "JOB_STATUS": "success"}


# ── what a publication says ──────────────────────────────────────────────────

def test_a_publication_names_the_race_the_winner_the_chaos_and_the_link(nt):
    m = nt.build_message(PUBLISHED, ENV)
    assert "Azerbaijan Grand Prix 2026" in m
    assert "RUS" in m and "from P2" in m
    assert "73/100" in m and "Extreme" in m
    assert "https://pitwallengineer.com/race/11377" in m


def test_a_sprint_is_named_as_one(nt):
    report = {**PUBLISHED, "published": [{**PUBLISHED["published"][0],
                                         "session_name": "Sprint", "session_key": 11348}]}
    assert "· Sprint" in nt.build_message(report, ENV)


def test_a_grand_prix_does_not_have_race_appended(nt):
    assert "· Race" not in nt.build_message(PUBLISHED, ENV)


def test_a_failed_module_is_not_hidden(nt):
    report = {**PUBLISHED, "published": [{**PUBLISHED["published"][0],
                                         "modules_failed": ["drs_trains", "clean_air_value"]}]}
    m = nt.build_message(report, ENV)
    assert "modules failed" in m and "drs_trains" in m


def test_a_dry_run_says_so(nt):
    report = {**PUBLISHED, "published": [{"session_key": 1, "label": "X", "dry_run": True}]}
    assert "dry run" in nt.build_message(report, ENV)


# ── failures ─────────────────────────────────────────────────────────────────

def test_a_stuck_session_reports_the_reason_and_points_at_the_issues(nt):
    report = {"published": [], "deferred": [], "errors": [], "stuck": [
        {"session_key": 11261, "label": "Sakhir 2026 · Race",
         "why": "no CHEQUERED FLAG in race_control", "missing": ["chequered"]},
    ]}
    m = nt.build_message(report, ENV)
    assert "Sakhir 2026" in m and "11261" in m
    assert "no CHEQUERED FLAG" in m
    assert ENV["ISSUES_URL"] in m


def test_an_error_is_reported_with_the_session_it_belongs_to(nt):
    report = {"published": [], "stuck": [], "deferred": [], "errors": [
        {"session_key": 11380, "error": "/analysis returned 500 ANALYSIS_FAILED"},
    ]}
    m = nt.build_message(report, ENV)
    assert "session 11380" in m and "ANALYSIS_FAILED" in m


def test_a_failed_job_with_no_report_detail_still_notifies(nt):
    m = nt.build_message({}, {**ENV, "JOB_STATUS": "failure"})
    assert m and "failed" in m.lower()
    assert ENV["RUN_URL"] in m


def test_a_run_link_is_always_included(nt):
    assert ENV["RUN_URL"] in nt.build_message(PUBLISHED, ENV)


def test_deferred_sessions_are_mentioned_so_silence_is_not_mistaken_for_done(nt):
    report = {**PUBLISHED, "deferred": [{"session_key": 2}, {"session_key": 3}]}
    assert "2 more session" in nt.build_message(report, ENV)


# ── silence ──────────────────────────────────────────────────────────────────

def test_a_quiet_hourly_run_sends_nothing(nt):
    """24 messages a day saying "no race finished" would train the reader to
    ignore the channel, which is the one thing it must not do."""
    assert nt.build_message({"published": [], "stuck": [], "errors": [], "deferred": []}, ENV) is None


def test_a_run_that_only_deferred_sends_nothing(nt):
    quiet = {"published": [], "stuck": [], "errors": [], "deferred": [{"session_key": 1}]}
    assert nt.build_message(quiet, ENV) is None


def test_an_empty_report_on_a_successful_run_sends_nothing(nt):
    assert nt.build_message({}, ENV) is None


# ── safety ───────────────────────────────────────────────────────────────────

def test_missing_credentials_print_the_message_and_exit_zero(nt, monkeypatch, capsys, tmp_path):
    """A notification that cannot be sent must not fail a run that published."""
    report = tmp_path / "r.json"
    report.write_text(__import__("json").dumps(PUBLISHED))
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)
    monkeypatch.setattr("sys.argv", ["notify_telegram.py", "--report", str(report)])

    assert nt.main() == 0
    out = capsys.readouterr().out
    assert "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID not set" in out
    assert "Azerbaijan" in out          # so the run log still has the content


def test_a_telegram_outage_does_not_fail_the_run(nt, monkeypatch, tmp_path, capsys):
    report = tmp_path / "r.json"
    report.write_text(__import__("json").dumps(PUBLISHED))
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:secret-token-value")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "456")
    monkeypatch.setattr("sys.argv", ["notify_telegram.py", "--report", str(report)])
    monkeypatch.setattr(nt, "send", lambda *a: False)

    assert nt.main() == 0
    assert "not sent" in capsys.readouterr().out


def test_the_token_is_never_printed(nt, monkeypatch, tmp_path, capsys):
    report = tmp_path / "r.json"
    report.write_text(__import__("json").dumps(PUBLISHED))
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:secret-token-value")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "456")
    monkeypatch.setattr("sys.argv", ["notify_telegram.py", "--report", str(report)])
    monkeypatch.setattr(nt, "send", lambda token, chat, text: (_ for _ in ()).throw(AssertionError) if False else False)

    nt.main()
    assert "secret-token-value" not in capsys.readouterr().out


def test_an_unparsable_report_is_not_a_crash(nt, monkeypatch, capsys):
    monkeypatch.setenv("REPORT", "not json at all")
    monkeypatch.setattr("sys.argv", ["notify_telegram.py"])
    assert nt.main() == 0


def test_html_in_a_race_name_is_escaped(nt):
    """parse_mode is HTML, so an unescaped < would silently drop the message."""
    report = {**PUBLISHED, "published": [{**PUBLISHED["published"][0],
                                         "meeting_name": "Grand Prix <b>of</b> & Co"}]}
    m = nt.build_message(report, ENV)
    assert "&lt;b&gt;of&lt;/b&gt; &amp; Co" in m
