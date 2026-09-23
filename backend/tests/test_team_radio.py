"""
Team radio: clips mapped to the driver's own lap, pre/post-session clips
kept off the lap axis, URL normalisation, module status, and the empty-answer
caching rule for unfinished sessions. No audio is ever fetched: the backend
only links to recording_url, and every test here uses synthetic data or a
MockTransport for the OpenF1 endpoint.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clients import openf1_client
from app.core import cache
from app.core.config import settings
from app.core.ratelimit import BlockingLimiter
from app.main import app
from app.services.team_radio_service import compute_team_radio, normalise_recording_url

T0 = datetime(2024, 11, 3, 15, 50, tzinfo=timezone.utc)
CDN = "https://livetiming.formula1.com/static/2024/2024-11-03_São_Paulo_Grand_Prix/2024-11-03_Race/TeamRadio"


def laps_for(dn: int, n: int = 10, lap_s: float = 90.0, offset_s: float = 0.0) -> list[dict]:
    return [
        {"driver_number": dn, "lap_number": i + 1, "lap_duration": lap_s,
         "date_start": (T0 + timedelta(seconds=offset_s + i * lap_s)).isoformat()}
        for i in range(n)
    ]


def clip(dn: int, seconds_from_t0: float, name: str = "X.mp3") -> dict:
    return {"driver_number": dn, "date": (T0 + timedelta(seconds=seconds_from_t0)).isoformat(),
            "recording_url": f"{CDN}/{name}", "session_key": 1, "meeting_key": 1}


DRIVERS = [{"driver_number": 44, "name_acronym": "HAM", "team_name": "Mercedes"},
           {"driver_number": 4, "name_acronym": "NOR", "team_name": "McLaren"}]


# ── mapping ──────────────────────────────────────────────────────────────────

def test_clip_maps_to_the_drivers_own_lap():
    # HAM's laps start 30 s later than NOR's: the same timestamp is a different lap for each
    laps = laps_for(44, offset_s=30) + laps_for(4)
    radio = [clip(44, 95), clip(4, 95)]          # 95 s after T0
    tr = compute_team_radio(radio, laps, DRIVERS)
    by = {c.driver_code: c for c in tr.clips}
    assert by["NOR"].lap_number == 2 and by["NOR"].phase == "race"   # NOR L2 starts at 90 s
    assert by["HAM"].lap_number == 1 and by["HAM"].phase == "race"   # HAM L2 starts at 120 s


def test_pre_session_clip_is_not_forced_onto_lap_1():
    tr = compute_team_radio([clip(44, -600)], laps_for(44), DRIVERS)
    c = tr.clips[0]
    assert (c.phase, c.lap_number) == ("pre", None)
    assert tr.pre_session == 1 and tr.in_race == 0


def test_post_session_clip_after_the_last_lap_ends():
    laps = laps_for(44, n=10)                    # last lap starts at 810 s, lasts 90 s
    tr = compute_team_radio([clip(44, 810 + 30), clip(44, 810 + 200)], laps, DRIVERS)
    phases = [(c.phase, c.lap_number) for c in tr.clips]
    assert phases == [("race", 10), ("post", None)]
    assert tr.post_session == 1


def test_session_without_radio_is_not_applicable():
    assert compute_team_radio([], laps_for(44), DRIVERS) is None


def test_session_with_a_single_driver_talking():
    radio = [clip(44, 10), clip(44, 100), clip(44, 500)]
    tr = compute_team_radio(radio, laps_for(44) + laps_for(4), DRIVERS)
    assert tr.total == 3 and tr.clips_per_driver == {"HAM": 3}
    assert {c.driver_code for c in tr.clips} == {"HAM"}
    assert [c.lap_number for c in tr.clips] == [1, 2, 6]


def test_driver_without_lap_data_is_pre_session():
    tr = compute_team_radio([clip(99, 100)], laps_for(44), DRIVERS)
    assert tr.clips[0].phase == "pre" and tr.clips[0].driver_code == "D99"


# ── URL normalisation ────────────────────────────────────────────────────────

def test_recording_url_path_is_percent_encoded_once():
    raw = f"{CDN}/LEWHAM01_44.mp3"
    enc = normalise_recording_url(raw)
    assert "S%C3%A3o_Paulo" in enc and "São" not in enc
    assert enc.startswith("https://livetiming.formula1.com/static/2024/")
    assert normalise_recording_url(enc) == enc               # idempotent
    assert normalise_recording_url("https://h/a%20b/c.mp3") == "https://h/a%20b/c.mp3"


def test_clips_carry_the_normalised_url():
    tr = compute_team_radio([clip(44, 100, "LEWHAM01_44.mp3")], laps_for(44), DRIVERS)
    assert "%C3%A3" in tr.clips[0].recording_url


# ── through the endpoint (mocked OpenF1, no audio) ───────────────────────────

@pytest.fixture
def fake_openf1(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "cache_dir", str(tmp_path))
    monkeypatch.setattr(openf1_client, "_BACKOFF", [0, 0, 0, 0])
    monkeypatch.setattr(openf1_client, "_semaphore", asyncio.Semaphore(2))
    monkeypatch.setattr(openf1_client, "_limiter", BlockingLimiter(1000, 10))
    real = httpx.AsyncClient

    def install(payloads: dict[str, list | None], session_meta: dict | None = None):
        seen: list[str] = []

        def handler(req: httpx.Request) -> httpx.Response:
            ep = req.url.path.rsplit("/", 1)[-1]
            seen.append(ep)
            if ep == "sessions":
                return httpx.Response(200, json=[session_meta] if session_meta else [])
            if ep == "meetings":
                return httpx.Response(200, json=[])
            body = payloads.get(ep)
            if body is None:
                return httpx.Response(404, json={"detail": "No results found."})
            return httpx.Response(200, json=body)

        class Patched(real):
            def __init__(self, *a, **kw):
                kw["transport"] = httpx.MockTransport(handler)
                super().__init__(*a, **kw)
        monkeypatch.setattr(httpx, "AsyncClient", Patched)
        return seen, tmp_path
    return install


def test_team_radio_is_the_ninth_endpoint():
    assert openf1_client.RACE_ENDPOINTS[-1] == "team_radio" and len(openf1_client.RACE_ENDPOINTS) == 9


def test_empty_answer_is_cached_only_when_the_session_has_finished(fake_openf1):
    seen, tmp = fake_openf1({}, session_meta={
        "session_key": 424250, "date_start": "2024-01-01T13:00:00+00:00",
        "date_end": "2024-01-01T15:00:00+00:00", "session_type": "Race", "meeting_key": 1,
    })
    asyncio.run(openf1_client.fetch_all(424250, "2024-01-01T15:00:00+00:00"))
    assert (tmp / "424250" / "team_radio.json").read_text().strip() == "[]"


def test_empty_answer_is_not_cached_while_the_session_runs(fake_openf1):
    seen, tmp = fake_openf1({})
    future_end = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    data = asyncio.run(openf1_client.fetch_all(424251, future_end))
    assert data["laps"] == [] and data["team_radio"] == []
    assert not (tmp / "424251").exists()                     # nothing written
    # and with no date_end at all, the conservative choice is also not to cache
    asyncio.run(openf1_client.fetch_all(424252, None))
    assert not (tmp / "424252").exists()
    assert openf1_client.session_finished(None) is False
