"""
The HTTP half of the live server: fan-out, compression and the session guard.

The reason this is ASGI rather than a ThreadingHTTPServer is a measurement, and
these tests hold the properties that measurement depended on. Against the same
300-viewer load, the threaded server fed none of them in eight seconds and held
1.1 GB across 283 threads; this one feeds all of them, first frame inside a
tenth of a second, on eight threads and 139 MB.

Two of those tests are about mistakes already made once here:

  gzip on a stream must flush per frame. A compressor that buffers until it has
  a worthwhile block is indistinguishable, on a page whose whole job is to say
  what is happening now, from the race having stopped.

  the connect path must not render its own snapshot. It did, synchronously on
  the event loop, at about 0.1 s each — so three hundred arrivals starved the
  loop for thirty seconds and most saw nothing at all.
"""
from __future__ import annotations

import asyncio
import contextlib
import http.client
import importlib.util
import json
import socket
import sys
import threading
import time
import zlib
from pathlib import Path

import pytest
import uvicorn
from starlette.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))

spec = importlib.util.spec_from_file_location("live_server", BACKEND / "scripts" / "live_server.py")
live_server = importlib.util.module_from_spec(spec)
sys.modules["live_server"] = live_server
spec.loader.exec_module(live_server)

from live_state import RaceState  # noqa: E402
from app.core.access import code_id, encode_token, mint_token  # noqa: E402
from app.core.config import settings  # noqa: E402

TEST_CODE = "LETMEIN"


@pytest.fixture(scope="module", autouse=True)
def pro_configured():
    """
    Live is PRO, so every test in this file needs a configured deployment.

    Module-scoped and set directly rather than through monkeypatch, because the
    uvicorn fixture below is module-scoped too and starts before any
    function-scoped patch would apply.
    """
    from pydantic import SecretStr

    before = (settings.pro_token_secret, settings.pro_access_codes)
    settings.pro_token_secret = SecretStr("a-test-secret")
    settings.pro_access_codes = [TEST_CODE]
    yield
    settings.pro_token_secret, settings.pro_access_codes = before


@pytest.fixture(scope="module")
def token(pro_configured) -> str:
    return encode_token(mint_token(code_id(TEST_CODE)))


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def a_state(session_key: int = 11377) -> RaceState:
    state = RaceState(session_key=session_key)
    state.ingest("v1/drivers", {"driver_number": 1, "name_acronym": "VER",
                                "team_name": "Red Bull Racing", "_key": "d1"}, recv=1000.0)
    state.ingest("v1/position", {"driver_number": 1, "position": 1, "_key": "p1"}, recv=1000.0)
    state.ingest("v1/laps", {"driver_number": 1, "lap_number": 12,
                             "lap_duration": 92.5, "_key": "l1"}, recv=1000.0)
    return state


@pytest.fixture()
def client():
    """For the ordinary request/response routes."""
    app = live_server.build_app(a_state(), live_server.Hub(), None, push_interval=0.05)
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def server():
    """
    A real uvicorn on a real port, for the streaming tests.

    Starlette's TestClient cannot close a response whose generator never ends,
    and an SSE stream never ends — it hangs on the way out rather than failing.
    Running the server the way it actually runs is both simpler and a better
    test: the chunked framing, the Content-Encoding and the flush behaviour
    below are all things only a real socket shows.
    """
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]

    app = live_server.build_app(a_state(), live_server.Hub(), None, push_interval=0.2)
    config = uvicorn.Config(app, host="127.0.0.1", port=port,
                            log_level="error", access_log=False,
                            timeout_graceful_shutdown=1)
    instance = uvicorn.Server(config)
    thread = threading.Thread(target=instance.run, daemon=True)
    thread.start()

    deadline = time.time() + 15
    while not instance.started and time.time() < deadline:
        time.sleep(0.05)
    assert instance.started, "uvicorn did not start"

    yield port

    instance.should_exit = True
    thread.join(timeout=10)


@contextlib.contextmanager
def stream(port: int, path: str, accept_encoding: str = "identity", origin: str | None = None,
           bearer: str | None = None):
    """An SSE connection, with the headers a browser actually sends."""
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=20)
    # http.client injects an Accept-Encoding of its own otherwise, and the
    # server honours that one instead — a trap this suite fell into once.
    conn.putrequest("GET", path, skip_accept_encoding=True)
    conn.putheader("Accept-Encoding", accept_encoding)
    conn.putheader("Accept", "text/event-stream")
    if bearer:
        conn.putheader("Authorization", f"Bearer {bearer}")
    if origin:
        conn.putheader("Origin", origin)
    conn.endheaders()
    try:
        yield conn.getresponse()
    finally:
        conn.close()


def read_frames(resp, gzipped: bool, want: int, timeout: float = 20.0) -> tuple[list[str], int, int]:
    """(frames, decoded bytes, wire bytes) — stops as soon as `want` arrive."""
    d = zlib.decompressobj(16 + zlib.MAX_WBITS) if gzipped else None
    frames, buf, wire, decoded = [], "", 0, 0
    deadline = time.time() + timeout
    while len(frames) < want and time.time() < deadline:
        chunk = resp.read1(65536)
        if not chunk:
            break
        wire += len(chunk)
        text = (d.decompress(chunk) if d else chunk).decode("utf-8", "replace")
        decoded += len(text)
        buf += text
        while "\n\n" in buf:
            frame, buf = buf.split("\n\n", 1)
            frames.append(frame)
    return frames, decoded, wire


# ── the session guard ────────────────────────────────────────────────────────

def test_the_snapshot_is_served_for_the_session_being_followed(client, token):
    r = client.get("/live/11377/snapshot", headers=auth(token))
    assert r.status_code == 200
    assert r.json()["session_key"] == 11377


def test_another_session_is_refused_rather_than_served_someone_elses_race(client, token):
    r = client.get("/live/9999/snapshot", headers=auth(token))
    assert r.status_code == 409
    assert r.json()["error"] == "SESSION_NOT_LIVE"
    assert "11377" in r.json()["message"]


def test_the_stream_refuses_the_wrong_session_too(server, token):
    with stream(server, "/live/9999/stream", bearer=token) as r:
        assert r.status == 409


# ── compression ──────────────────────────────────────────────────────────────

def test_an_ordinary_response_is_gzipped(client, token):
    plain = client.get("/live/11377/snapshot", headers={"Accept-Encoding": "identity", **auth(token)})
    assert "content-encoding" not in plain.headers

    r = client.get("/live/11377/snapshot", headers={"Accept-Encoding": "gzip", **auth(token)})
    assert r.headers["content-encoding"] == "gzip"
    # Same document either way. Not the same bytes: generated_at and uptime_s
    # move between two requests a millisecond apart.
    assert r.json()["session_key"] == plain.json()["session_key"] == 11377
    assert len(r.content) > 500, "decoded by httpx, so this is the real payload"


def test_the_stream_is_gzipped_and_every_frame_is_flushed(server, token):
    """
    The important one. Each frame must decode as it arrives — a compressor
    holding frames back to fill a block reads, on this page, as a dead feed.
    Three frames must come out of a stream that has sent nothing else.
    """
    with stream(server, "/live/11377/stream", "gzip", bearer=token) as r:
        assert r.status == 200
        assert r.getheader("Content-Encoding") == "gzip"
        assert r.getheader("Content-Type") == "text/event-stream"

        frames, decoded, wire = read_frames(r, gzipped=True, want=3)
        assert len(frames) >= 3
        assert decoded > wire, f"{decoded} B decoded from {wire} B on the wire"


def test_gzip_actually_shrinks_the_stream(server, token):
    """The reason for doing it at all: 26 KB of snapshot became 4.5 KB."""
    with stream(server, "/live/11377/stream", "gzip", bearer=token) as r:
        _, decoded, wire = read_frames(r, gzipped=True, want=4)
    assert decoded / wire > 2.0, f"only {decoded / wire:.1f}x"


def test_the_stream_is_plain_when_gzip_is_not_offered(server, token):
    with stream(server, "/live/11377/stream", "identity", bearer=token) as r:
        assert r.getheader("Content-Encoding") is None
        frames, _, _ = read_frames(r, gzipped=False, want=1)
        assert frames[0].startswith("data: ")


def test_the_stream_says_it_must_not_be_buffered(server, token):
    with stream(server, "/live/11377/stream", bearer=token) as r:
        assert r.getheader("X-Accel-Buffering") == "no"
        assert r.getheader("Cache-Control") == "no-store"


def test_the_first_frame_is_a_whole_snapshot(server, token):
    with stream(server, "/live/11377/stream", "identity", bearer=token) as r:
        frames, _, _ = read_frames(r, gzipped=False, want=1)
    payload = json.loads(frames[0].split("data: ", 1)[1])
    assert payload["session_key"] == 11377
    assert payload["tower"][0]["code"] == "VER"


def test_frames_keep_arriving_rather_than_only_the_first(server, token):
    """A stream that sends one snapshot and goes quiet looks identical to a
    working one for the first two seconds. Three frames, spaced, is the check."""
    with stream(server, "/live/11377/stream", "identity", bearer=token) as r:
        t0 = time.time()
        frames, _, _ = read_frames(r, gzipped=False, want=3)
    assert len(frames) >= 3
    assert time.time() - t0 >= 0.2, "frames arrived over time, not in one burst"


def test_many_viewers_are_all_fed(server, token):
    """
    The change this file exists for. Against the threaded server it replaces,
    300 simultaneous viewers were fed nothing in eight seconds; here every one
    of them gets the current frame straight away, because the connect path
    hands out the last published one instead of rendering its own.
    """
    results: list[int] = []
    lock = threading.Lock()

    def one():
        try:
            with stream(server, "/live/11377/stream", "identity", bearer=token) as r:
                frames, _, _ = read_frames(r, gzipped=False, want=1, timeout=15)
            with lock:
                results.append(len(frames))
        except OSError:
            with lock:
                results.append(0)

    threads = [threading.Thread(target=one) for _ in range(60)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=25)

    assert len(results) == 60
    assert all(n >= 1 for n in results), f"{results.count(0)} viewers were fed nothing"


# ── the fan-out ──────────────────────────────────────────────────────────────

def test_a_viewer_is_served_the_last_published_frame_not_a_fresh_one():
    """
    The connect path must not render a snapshot of its own. It is the whole
    reason for the fan-out, and it was the one place still ignoring it.
    """
    hub = live_server.Hub()
    hub.publish('{"already": "rendered"}')
    assert hub.latest == '{"already": "rendered"}'


def test_publish_reaches_every_subscriber():
    async def go():
        hub = live_server.Hub()
        queues = [hub.subscribe() for _ in range(5)]
        hub.publish("frame")
        assert hub.count == 5
        return [q.get_nowait() for q in queues]

    assert asyncio.run(go()) == ["frame"] * 5


def test_a_stalled_viewer_drops_frames_rather_than_growing_a_buffer():
    """
    Every frame is the whole state, so a viewer that cannot keep up loses
    nothing by missing one — the next supersedes it. An unbounded queue would
    make one stalled browser the process's memory problem.
    """
    async def go():
        hub = live_server.Hub(maxsize=2)
        hub.subscribe()
        for i in range(10):
            hub.publish(f"frame {i}")
        return hub.dropped

    assert asyncio.run(go()) == 8


def test_unsubscribe_releases_the_viewer():
    async def go():
        hub = live_server.Hub()
        q = hub.subscribe()
        assert hub.count == 1
        hub.unsubscribe(q)
        hub.unsubscribe(q)          # twice must be harmless
        return hub.count

    assert asyncio.run(go()) == 0


def test_health_reports_the_session_and_the_viewers(client):
    body = client.get("/health").json()
    assert body["ok"] is True
    assert body["session_key"] == 11377
    assert body["viewers"] == 0
    assert body["frames_dropped"] == 0


# ── CORS ─────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("origin", [
    "http://localhost:3000",
    "http://localhost:3100",        # whatever port `next dev` picked
    "http://127.0.0.1:3000",
])
def test_a_local_dev_origin_is_allowed_on_any_port(client, token, origin):
    r = client.get("/live/11377/snapshot", headers={"Origin": origin, **auth(token)})
    assert r.headers["access-control-allow-origin"] == origin


def test_an_unknown_origin_is_not_granted_access(client, token):
    r = client.get("/live/11377/snapshot", headers={"Origin": "https://evil.example", **auth(token)})
    assert "access-control-allow-origin" not in r.headers


# ── the PRO gate ─────────────────────────────────────────────────────────────
#
# Live is PRO. The gate uses app.core.access — the API's verifier, imported
# rather than reimplemented, because two HMAC checks that can drift apart is a
# worse outcome than one extra dependency in this service.

@pytest.fixture()
def gated_client(client, token):
    return client, token


def test_the_snapshot_needs_a_token(gated_client):
    client, _ = gated_client
    r = client.get("/live/11377/snapshot")
    assert r.status_code == 402
    assert r.json()["error"]["code"] == "PRO_REQUIRED"


def test_the_snapshot_is_served_with_a_valid_token(gated_client):
    client, token = gated_client
    r = client.get("/live/11377/snapshot", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["session_key"] == 11377


def test_the_stream_needs_a_token(gated_client):
    client, _ = gated_client
    with client.stream("GET", "/live/11377/stream") as r:
        assert r.status_code == 402


def test_a_tampered_token_is_refused(gated_client):
    client, token = gated_client
    head, payload, signature = token.split(".")
    forged = f"{head}.{payload}.{'A' * len(signature)}"
    r = client.get("/live/11377/snapshot", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 402


def test_a_revoked_code_stops_working_without_waiting_for_expiry(gated_client, monkeypatch):
    client, token = gated_client
    assert client.get("/live/11377/snapshot",
                      headers={"Authorization": f"Bearer {token}"}).status_code == 200
    monkeypatch.setattr(settings, "pro_access_codes", [], raising=False)
    assert client.get("/live/11377/snapshot",
                      headers={"Authorization": f"Bearer {token}"}).status_code == 402


def test_the_gate_is_checked_before_the_session_so_a_refusal_leaks_nothing(gated_client):
    """
    An unauthenticated caller must not learn which session this server follows
    by reading the difference between 402 and 409.
    """
    client, _ = gated_client
    r = client.get("/live/9999/snapshot")
    assert r.status_code == 402
    assert "11377" not in r.text


def test_without_a_secret_nothing_verifies(token, monkeypatch):
    """A live server deployed without PRO_TOKEN_SECRET serves nobody."""
    from pydantic import SecretStr
    monkeypatch.setattr(settings, "pro_token_secret", SecretStr(""), raising=False)
    app = live_server.build_app(a_state(), live_server.Hub(), None, push_interval=0.05)
    with TestClient(app) as c:
        assert c.get("/live/11377/snapshot",
                     headers={"Authorization": f"Bearer {token}"}).status_code == 402


# ── the development routes ───────────────────────────────────────────────────

def test_unauthenticated_routes_exist_only_on_a_loopback_bind():
    """
    /events, /snapshot.json and the raw page carry no token. They must not
    become a way around the gate the moment the same file is bound to 0.0.0.0.
    """
    assert live_server.is_loopback("127.0.0.1")
    assert live_server.is_loopback("localhost")
    assert not live_server.is_loopback("0.0.0.0")

    public = live_server.build_app(a_state(), live_server.Hub(), None, dev_routes=False)
    with TestClient(public) as c:
        for path in ("/events", "/snapshot.json", "/"):
            assert c.get(path).status_code == 404, path

    local = live_server.build_app(a_state(), live_server.Hub(), None, dev_routes=True)
    with TestClient(local) as c:
        assert c.get("/snapshot.json").status_code == 200


def test_health_needs_no_token_because_render_cannot_send_one(gated_client):
    client, _ = gated_client
    assert client.get("/health").status_code == 200
