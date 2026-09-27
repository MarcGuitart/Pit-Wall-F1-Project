"""
The historical gate: /analysis must not refuse a session that has demonstrably
finished. OpenF1 publishes date_end in the session metadata, so that is what
decides; the per-type duration table is a fallback for metadata without it.

Real sessions used as fixtures (values from OpenF1 session metadata):
  Madrid 2026 race  11369: 13:00 → 15:00
  Baku 2026 race    11377: 11:00 → 13:00
  Baku 2026 FP1     11362: 09:30 → 10:30   (a shorter session type)
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.utils.time import (
    DEFAULT_UNLOCK_BUFFER,
    SESSION_DURATION_ESTIMATE,
    estimate_session_end,
    is_session_historical,
    session_end,
    unlock_buffer,
)

MADRID = ("2026-09-13T13:00:00+00:00", "Race", "2026-09-13T15:00:00+00:00")
BAKU = ("2026-09-26T11:00:00+00:00", "Race", "2026-09-26T13:00:00+00:00")
BAKU_FP1 = ("2026-09-25T09:30:00+00:00", "Practice 1", "2026-09-25T10:30:00+00:00")


def iso(dt: datetime) -> str:
    return dt.isoformat()


# ── date_end decides ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("label, fixture, expected_unlock", [
    ("Madrid race", MADRID, "2026-09-13T15:30:00+00:00"),
    ("Baku race", BAKU, "2026-09-26T13:30:00+00:00"),
    ("Baku FP1", BAKU_FP1, "2026-09-25T11:00:00+00:00"),
])
def test_unlock_is_published_end_plus_buffer(label, fixture, expected_unlock):
    ds, st, de = fixture
    end, source = session_end(ds, st, de)
    assert source == "published"
    assert iso(end) == de
    _, unlock = is_session_historical(ds, st, de)
    assert iso(unlock) == expected_unlock, label


def test_practice_and_race_differ_only_by_their_own_date_end():
    """With date_end published, the duration table plays no part at all."""
    for ds, st, de in (BAKU, BAKU_FP1):
        end, source = session_end(ds, st, de)
        assert source == "published" and iso(end) == de
    # the same start and date_end give the same answer whatever the type says
    a, _ = session_end(BAKU[0], "Race", BAKU[2])
    b, _ = session_end(BAKU[0], "Practice 1", BAKU[2])
    assert a == b


def test_the_bug_this_fixes_is_an_hour_for_a_two_hour_race():
    """
    A 2 h race used to unlock at date_start + 3 h + 30 min = 90 min after the
    flag. It now unlocks 30 min after the flag, so the gate opens an hour
    earlier. Both numbers are asserted so neither can drift unnoticed.
    """
    ds, st, de = BAKU
    real_end = datetime(2026, 9, 26, 13, tzinfo=timezone.utc)
    _, unlock_now = is_session_historical(ds, st, de)
    old_unlock = estimate_session_end(ds, st) + DEFAULT_UNLOCK_BUFFER   # the pre-fix path
    assert old_unlock - real_end == timedelta(minutes=90)     # was: 90 min after the end
    assert unlock_now - real_end == timedelta(minutes=30)     # now: the buffer, nothing more
    assert old_unlock - unlock_now == timedelta(hours=1)      # an hour earlier


# ── fallback when date_end is absent ─────────────────────────────────────────

@pytest.mark.parametrize("session_type, duration", list(SESSION_DURATION_ESTIMATE.items()))
def test_fallback_uses_the_per_type_duration(session_type, duration):
    ds = "2026-09-26T11:00:00+00:00"
    end, source = session_end(ds, session_type, None)
    assert source == "estimated"
    assert end == datetime(2026, 9, 26, 11, tzinfo=timezone.utc) + duration


@pytest.mark.parametrize("bad", [None, "", "not-a-date", "2026-13-45T99:99:99"])
def test_unusable_date_end_falls_back_instead_of_raising(bad):
    ds, st, _ = BAKU
    end, source = session_end(ds, st, bad)
    assert source == "estimated"
    assert end == datetime(2026, 9, 26, 14, tzinfo=timezone.utc)


def test_unknown_session_type_defaults_to_three_hours():
    end, source = session_end("2026-09-26T11:00:00+00:00", "Some New Format", None)
    assert source == "estimated"
    assert end == datetime(2026, 9, 26, 14, tzinfo=timezone.utc)


def test_no_usable_timestamp_at_all_raises():
    with pytest.raises(ValueError):
        session_end("", "Race", None)


def test_naive_timestamps_are_treated_as_utc():
    end, source = session_end("2026-09-26T11:00:00", "Race", "2026-09-26T13:00:00")
    assert source == "published"
    assert end == datetime(2026, 9, 26, 13, tzinfo=timezone.utc)


# ── the buffer is configurable ───────────────────────────────────────────────

def test_buffer_default_is_thirty_minutes():
    assert DEFAULT_UNLOCK_BUFFER == timedelta(minutes=30)
    assert unlock_buffer() == timedelta(minutes=30)


@pytest.mark.parametrize("minutes", [0, 5, 45, 120])
def test_buffer_honours_the_setting(monkeypatch, minutes):
    monkeypatch.setattr(settings, "session_unlock_buffer_minutes", minutes)
    assert unlock_buffer() == timedelta(minutes=minutes)
    ds, st, de = BAKU
    _, unlock = is_session_historical(ds, st, de)
    assert unlock == datetime(2026, 9, 26, 13, tzinfo=timezone.utc) + timedelta(minutes=minutes)


# ── the boolean itself ───────────────────────────────────────────────────────

def test_a_session_that_ended_long_ago_is_historical():
    hist, _ = is_session_historical(*BAKU)
    assert hist is True


def test_a_session_still_inside_the_buffer_is_not_historical(monkeypatch):
    now = datetime.now(timezone.utc)
    ended_ten_minutes_ago = now - timedelta(minutes=10)
    hist, unlock = is_session_historical(
        iso(ended_ten_minutes_ago - timedelta(hours=2)), "Race", iso(ended_ten_minutes_ago)
    )
    assert hist is False
    assert timedelta(minutes=19) < unlock - now < timedelta(minutes=21)


def test_a_future_session_is_not_historical():
    start = datetime.now(timezone.utc) + timedelta(hours=3)
    hist, _ = is_session_historical(iso(start), "Race", iso(start + timedelta(hours=2)))
    assert hist is False
