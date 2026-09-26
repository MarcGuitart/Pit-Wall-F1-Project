"""
Experimental live snapshot server. A third process, on its own port, with its
own MQTT client_id. It does not touch the recorder, /analysis, the cache or
anything under app/api.

    python scripts/live_server.py                       # live MQTT
    python scripts/live_server.py --replay 9636 --replay-speed 0.02
    open http://127.0.0.1:8099/

Endpoints (no auth, no persistence — this is a one-night experiment):
    GET /               the observation page
    GET /events         SSE stream, one snapshot per push
    GET /snapshot.json  the current snapshot, once

MQTT allows many subscribers on the same topics, so this runs alongside
live_recorder.py without interfering: separate connection, separate client_id,
separate token. The recorder remains the system of record; if this process
dies, nothing is lost.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import queue
import ssl
import sys
import threading
import time
import traceback
from datetime import datetime, timezone
from functools import wraps
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, ".")           # backend/ — for app.*

import paho.mqtt.client as mqtt  # noqa: E402
from paho.mqtt.enums import CallbackAPIVersion  # noqa: E402

from app.clients.openf1_auth import token_manager  # read-only use  # noqa: E402
from app.core.config import settings  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))   # live_state.py sits next to this file
from live_state import TOPICS, RaceState, replay  # noqa: E402

BROKER_HOST, BROKER_PORT, QOS = "mqtt.openf1.org", 8883, 1
PUSH_INTERVAL_S = 2.0          # how often a snapshot is pushed to browsers
RENEW_BEFORE_S = 420.0
HERE = Path(__file__).resolve().parent


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def log(kind: str, msg: str) -> None:
    print(f"[{kind:<7}] {datetime.now(timezone.utc).strftime('%H:%M:%S')} {msg}", flush=True)


def rc_int(reason_code) -> int:
    return int(getattr(reason_code, "value", reason_code))


def guard(fn):
    """Same lesson as the recorder: paho swallows callback exceptions."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception as exc:
            log("BUG!", f"exception in {fn.__name__}: {type(exc).__name__}: {exc}")
            traceback.print_exc()
    return wrapper


class Hub:
    """Fan-out of snapshots to connected browsers."""

    def __init__(self) -> None:
        self.clients: list[queue.Queue] = []
        self.lock = threading.Lock()

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=8)
        with self.lock:
            self.clients.append(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self.lock:
            if q in self.clients:
                self.clients.remove(q)

    def publish(self, payload: str) -> None:
        with self.lock:
            targets = list(self.clients)
        for q in targets:
            try:
                q.put_nowait(payload)
            except queue.Full:
                pass          # a slow browser simply misses a frame

    @property
    def count(self) -> int:
        with self.lock:
            return len(self.clients)


class LiveFeed:
    """MQTT → RaceState, with the same token-renewal reconnect as the recorder."""

    def __init__(self, state: RaceState) -> None:
        self.state = state
        self.client: mqtt.Client | None = None
        self.connected = False
        self.token: str | None = None
        self.token_at = 0.0
        self.token_ttl = 0.0
        self.renewals = 0
        self._renewing = threading.Event()
        self._stop = threading.Event()

    @property
    def token_expires_in(self) -> float:
        return max(0.0, self.token_ttl - (time.time() - self.token_at))

    def fetch_token(self) -> str:
        token = asyncio.run(token_manager.get_token())
        if not token:
            raise SystemExit("no OpenF1 token — set OPENF1_USERNAME / OPENF1_PASSWORD")
        self.token, self.token_at, self.token_ttl = token, time.time(), token_manager.seconds_left
        log("TOKEN", f"obtained, expires in {self.token_ttl:.0f}s")
        return token

    @guard
    def on_connect(self, client, userdata, flags, reason_code, properties=None):
        rc = rc_int(reason_code)
        self.connected = rc == 0
        log("CONNECT" if rc == 0 else "CONNECT!", f"rc={rc} ({reason_code})")
        if rc == 0:
            client.subscribe([(t, QOS) for t in TOPICS])

    @guard
    def on_subscribe(self, client, userdata, mid, reason_codes, properties=None):
        log("SUBSCRIBE", f"granted={[rc_int(c) for c in reason_codes]}")

    @guard
    def on_disconnect(self, client, userdata, flags=None, reason_code=None, properties=None):
        self.connected = False
        deliberate = self._renewing.is_set() or self._stop.is_set()
        log("DISCONN" if deliberate else "DISCONN!",
            f"rc={rc_int(reason_code) if reason_code is not None else -1}"
            + (" (deliberate)" if deliberate else " — paho will retry"))

    @guard
    def on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload)
        except Exception:
            return
        if isinstance(payload, list):
            for item in payload:
                self.state.ingest(msg.topic, item)
        else:
            self.state.ingest(msg.topic, payload)

    def connect(self) -> None:
        c = mqtt.Client(CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv311,
                        client_id=f"pitwall-live-{int(time.time())}")
        c.username_pw_set(username=settings.openf1_username or "live", password=self.token)
        c.tls_set(cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS_CLIENT)
        c.reconnect_delay_set(min_delay=1, max_delay=30)
        c.on_connect, c.on_subscribe = self.on_connect, self.on_subscribe
        c.on_disconnect, c.on_message = self.on_disconnect, self.on_message
        c.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
        c.loop_start()
        self.client = c

    def renew(self) -> None:
        self.renewals += 1
        log("RENEW", f"#{self.renewals} token expires in {self.token_expires_in:.0f}s — reconnecting")
        token_manager.clear()
        try:
            self.fetch_token()
        except Exception as exc:
            log("RENEW!", f"could not get a token: {exc}")
            return
        self._renewing.set()
        cut = time.time()
        try:
            if self.client:
                self.client.loop_stop()
                self.client.disconnect()
            self.connect()
        except Exception as exc:
            log("RENEW!", f"reconnect failed: {exc}")
        deadline = time.time() + 20
        while time.time() < deadline and not self.connected:
            time.sleep(0.05)
        self._renewing.clear()
        log("RENEW" if self.connected else "RENEW!",
            f"#{self.renewals} {'reconnected' if self.connected else 'NOT reconnected'} — gap {time.time() - cut:.2f}s")

    def run(self) -> None:
        self.fetch_token()
        self.connect()
        while not self._stop.is_set():
            time.sleep(1.0)
            if not self._renewing.is_set() and self.token_expires_in <= RENEW_BEFORE_S:
                self.renew()

    def stop(self) -> None:
        self._stop.set()
        try:
            if self.client:
                self.client.loop_stop()
                self.client.disconnect()
        except Exception:
            pass


def make_handler(state: RaceState, hub: Hub, feed: LiveFeed | None):
    page = HERE / "live_view.html"

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):     # quiet: the interesting log is ours
            pass

        def _send(self, code: int, body: bytes, ctype: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path.startswith("/events"):
                return self.sse()
            if self.path.startswith("/snapshot.json"):
                body = json.dumps(snapshot_payload(state, hub, feed), default=str).encode()
                return self._send(200, body, "application/json")
            if self.path in ("/", "/index.html"):
                if not page.exists():
                    return self._send(500, b"live_view.html is missing", "text/plain")
                return self._send(200, page.read_bytes(), "text/html; charset=utf-8")
            return self._send(404, b"not found", "text/plain")

        def sse(self):
            q = hub.subscribe()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            try:
                first = json.dumps(snapshot_payload(state, hub, feed), default=str)
                self.wfile.write(f"data: {first}\n\n".encode())
                self.wfile.flush()
                while True:
                    try:
                        payload = q.get(timeout=15)
                        self.wfile.write(f"data: {payload}\n\n".encode())
                    except queue.Empty:
                        self.wfile.write(b": keep-alive\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                hub.unsubscribe(q)

    return Handler


def snapshot_payload(state: RaceState, hub: Hub, feed: LiveFeed | None) -> dict:
    snap = state.snapshot(include_analysis=True)
    snap["feed"] = {
        "mode": "mqtt" if feed else "replay",
        "connected": bool(feed and feed.connected),
        "token_expires_in_s": round(feed.token_expires_in) if feed else None,
        "renewals": feed.renewals if feed else 0,
        "browsers": hub.count,
    }
    return snap


def main() -> int:
    ap = argparse.ArgumentParser(description="Experimental live snapshot server (isolated).")
    ap.add_argument("--port", type=int, default=8099)
    ap.add_argument("--replay", type=int, metavar="SESSION_KEY",
                    help="no MQTT: replay a cached session so the page can be exercised")
    ap.add_argument("--replay-speed", type=float, default=0.02,
                    help="seconds to sleep every 50 replayed events (default 0.02)")
    args = ap.parse_args()

    state = RaceState(session_key=args.replay)
    hub = Hub()
    feed: LiveFeed | None = None

    if args.replay:
        log("MODE", f"replay of cached session {args.replay} (no MQTT)")
        threading.Thread(target=replay, args=(args.replay, state),
                         kwargs={"speed": args.replay_speed}, daemon=True).start()
    else:
        if not token_manager.configured:
            print("FAIL: OPENF1_USERNAME / OPENF1_PASSWORD are not set.")
            return 1
        log("MODE", "live MQTT (separate client_id; the recorder is untouched)")
        feed = LiveFeed(state)
        threading.Thread(target=feed.run, daemon=True).start()

    def pusher():
        while True:
            time.sleep(PUSH_INTERVAL_S)
            try:
                hub.publish(json.dumps(snapshot_payload(state, hub, feed), default=str))
            except Exception as exc:
                log("BUG!", f"pusher: {type(exc).__name__}: {exc}")
    threading.Thread(target=pusher, daemon=True).start()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(state, hub, feed))
    server.daemon_threads = True
    log("SERVE", f"http://127.0.0.1:{args.port}/  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
        log("STOP", "shutting down")
    finally:
        if feed:
            feed.stop()
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
