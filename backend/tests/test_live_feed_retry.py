"""
The live server's MQTT feed survives a broker or OpenF1 that does not answer at boot.

It used to connect with a blocking connect() before paho's loop existed: a
TimeoutError there ended the feed thread for good, and /health still said ok.
Now paho retries the first connection itself (connect_async + loop_start), the
first token is retried with backoff, and /health says whether the feed runs.
"""
from __future__ import annotations

import socket
import sys
import threading
import time
from pathlib import Path

from starlette.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))

if "live_server" in sys.modules:
    live_server = sys.modules["live_server"]
else:
    import importlib.util
    spec = importlib.util.spec_from_file_location("live_server", BACKEND / "scripts" / "live_server.py")
    live_server = importlib.util.module_from_spec(spec)
    sys.modules["live_server"] = live_server
    spec.loader.exec_module(live_server)

from live_state import RaceState  # noqa: E402


def a_closed_port() -> int:
    """A local port nothing listens on: every connection to it is refused at once."""
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def test_a_broker_that_does_not_answer_leaves_paho_retrying(monkeypatch):
    monkeypatch.setattr(live_server, "BROKER_HOST", "127.0.0.1")
    monkeypatch.setattr(live_server, "BROKER_PORT", a_closed_port())
    feed = live_server.LiveFeed(RaceState())
    feed.token = "not-a-real-token"
    try:
        feed.connect()                       # used to raise here, killing the thread
        time.sleep(2.5)                      # past the 1 s and 2 s retries
        assert feed.client is not None
        assert feed.client._thread is not None and feed.client._thread.is_alive()
        assert feed.connected is False
    finally:
        feed.stop()


def test_the_first_token_is_retried_with_backoff(monkeypatch):
    feed = live_server.LiveFeed(RaceState())
    calls = []

    def flaky():
        calls.append(time.time())
        if len(calls) < 3:
            raise RuntimeError("OpenF1 did not answer")
        feed.token = "t"
        return "t"

    monkeypatch.setattr(feed, "fetch_token", flaky)
    assert feed.first_token(min_delay=0.01, max_delay=0.02) is True
    assert len(calls) == 3
    assert feed.last_error == "token: OpenF1 did not answer"


def test_no_token_at_all_is_retried_too_not_the_end(monkeypatch):
    """get_token() giving nothing back raises SystemExit, which `except Exception` would let through."""
    feed = live_server.LiveFeed(RaceState())
    attempts = []

    def none_then_ok():
        attempts.append(1)
        if len(attempts) == 1:
            raise SystemExit("no OpenF1 token")
        return "t"

    monkeypatch.setattr(feed, "fetch_token", none_then_ok)
    assert feed.first_token(min_delay=0.01) is True


def test_stop_ends_the_token_retries(monkeypatch):
    feed = live_server.LiveFeed(RaceState())
    monkeypatch.setattr(feed, "fetch_token", lambda: (_ for _ in ()).throw(RuntimeError("down")))
    t = threading.Thread(target=feed.run, daemon=True)
    t.start()
    time.sleep(0.1)
    assert feed.running is True
    feed.stop()
    t.join(timeout=5)
    assert not t.is_alive() and feed.running is False


def test_an_unexpected_failure_is_reported_not_silent(monkeypatch):
    feed = live_server.LiveFeed(RaceState())
    monkeypatch.setattr(feed, "fetch_token", lambda: "t")
    monkeypatch.setattr(feed, "connect", lambda: (_ for _ in ()).throw(ValueError("bad broker config")))
    feed.run()
    assert feed.running is False
    assert feed.last_error == "feed: ValueError: bad broker config"


def test_health_says_whether_the_feed_runs():
    feed = live_server.LiveFeed(RaceState())
    feed.last_error = "token: down"
    app = live_server.build_app(RaceState(), live_server.Hub(), feed, dev_routes=False)
    with TestClient(app) as c:
        body = c.get("/health").json()
    assert body["ok"] is True
    assert body["feed"] == {"running": False, "connected": False, "renewals": 0, "last_error": "token: down"}


def test_health_in_replay_mode_has_no_feed():
    app = live_server.build_app(RaceState(), live_server.Hub(), None, dev_routes=False)
    with TestClient(app) as c:
        assert c.get("/health").json()["feed"] is None
