"""
Experimental live snapshot server. A third process, on its own port, with its
own MQTT client_id. It does not touch the recorder, /analysis, the cache or
anything under app/api.

    python scripts/live_server.py                                  # live MQTT
    python scripts/live_server.py --replay-capture live/2026-09-26_race_11377 --speed 60
    python scripts/live_server.py --replay 9636 --replay-speed 0.02
    open http://127.0.0.1:8099/

Endpoints (no auth, no persistence):
    GET /                               the raw observation page
    GET /events                         SSE stream, one snapshot per push
    GET /snapshot.json                  the current snapshot, once
    GET /live/{session_key}/snapshot    the same, refusing a key we are not on
    GET /live/{session_key}/stream      the same SSE, refusing a key we are not on

The session-scoped pair is what the Next.js /live/[sessionKey] route calls. It
is served with CORS open to the configured frontend origins, because the
frontend must never reach OpenF1 itself: the browser talks to this process,
this process talks to the broker.

Live is PRO. Both session-scoped routes require the same signed token the API
requires, verified by the same app.core.access code — imported, never
reimplemented, because two HMAC checks that can drift apart is a worse outcome
than one extra dependency in this service. Without a valid token they answer
PRO_REQUIRED, in the same envelope the API uses, so the frontend switches on one
code rather than two.

The token travels in the Authorization header, which means the browser cannot
use EventSource: EventSource sends no custom headers, and the only way to get a
token past it is the query string, where it lands in every access log and proxy
log on the path. The frontend reads the stream with fetch instead.

/events, /snapshot.json and the raw observation page carry no token and are
registered only when the server is bound to a loopback address. They are how
this is developed and they must not become a way around the gate the moment the
same file is bound to 0.0.0.0 on Render — so the bind address decides, rather
than a flag someone has to remember.

MQTT allows many subscribers on the same topics, so this runs alongside
live_recorder.py without interfering: separate connection, separate client_id,
separate token. The recorder remains the system of record; if this process
dies, nothing is lost.

The HTTP half is ASGI (Starlette on uvicorn), not a ThreadingHTTPServer. A
snapshot is 26 KB and goes out every 2 s, so a thread per viewer put the ceiling
in the low hundreds on a 512 MB instance — thread stacks, not work. Viewers are
now coroutines on one loop, each holding an asyncio.Queue.

The MQTT client and the capture replay stay on threads. Both are blocking by
nature, paho owns its own loop, and neither should be converted just to match:
the reason to be async here is ten thousand idle sockets, which is not what
either of those is.

Responses are gzipped, including the SSE stream, which matters more than it
looks: 26 KB becomes 4.5 KB, and over a two-hour race that is 94 MB per viewer
against 16 MB. The stream compresses each frame with an explicit sync flush
rather than through GZipMiddleware, because a compressor that buffers is
indistinguishable from a feed that has stopped.
"""
from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import os
import ssl
import sys
import threading
import time
import traceback
import zlib
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

sys.path.insert(0, ".")           # backend/ — for app.*

import paho.mqtt.client as mqtt  # noqa: E402
import uvicorn  # noqa: E402
from paho.mqtt.enums import CallbackAPIVersion  # noqa: E402
from starlette.applications import Starlette  # noqa: E402
from starlette.middleware import Middleware  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402
from starlette.middleware.gzip import GZipMiddleware  # noqa: E402
from starlette.requests import Request  # noqa: E402
from starlette.responses import FileResponse, JSONResponse, Response, StreamingResponse  # noqa: E402
from starlette.routing import Route  # noqa: E402

from app.clients.openf1_auth import token_manager  # read-only use  # noqa: E402
from app.core.access import decode_token  # the API's verifier, not a copy  # noqa: E402
from app.core.config import settings  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))   # live_state.py sits next to this file
from live_state import TOPICS, RaceState, replay, replay_capture  # noqa: E402

BROKER_HOST, BROKER_PORT, QOS = "mqtt.openf1.org", 8883, 1

# Deployed origins come from LIVE_ALLOWED_ORIGINS (comma separated) — an
# allow-list and not a wildcard, because this stream is the only thing standing
# between a browser and credentials it must never hold. Any local dev origin is
# allowed on top, whatever port `next dev` happened to pick; the regex is passed
# to CORSMiddleware in build_app().
ALLOWED_ORIGINS = tuple(
    o.strip() for o in (os.environ.get("LIVE_ALLOWED_ORIGINS") or "").split(",") if o.strip()
)
LOCAL_ORIGIN_RE = r"http://(localhost|127\.0\.0\.1)(:\d+)?"

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
    """
    Fan-out of snapshots to connected viewers.

    One asyncio.Queue per viewer, bounded. A viewer that cannot keep up misses
    frames rather than growing a buffer: every frame is the whole state, so the
    next one supersedes the one that was dropped and nothing is lost by
    skipping. An unbounded queue would turn one stalled browser into the
    process's memory problem.

    publish() is called from the event loop. The producers that are not on it —
    nothing today, but the MQTT thread is one edit away — must go through
    publish_threadsafe().
    """

    def __init__(self, maxsize: int = 8) -> None:
        self.maxsize = maxsize
        self.clients: set[asyncio.Queue[str]] = set()
        self.dropped = 0
        # The most recent published frame, handed to a viewer the moment it
        # connects. Without it every connection computed its own snapshot, on
        # the event loop, before yielding anything — about 0.1 s of synchronous
        # work each. Three hundred viewers arriving together then spent thirty
        # seconds starving the loop, and most of them saw no frame at all while
        # it lasted. Rendering the state once and sending the same string to
        # everyone is the whole point of the fan-out; the connect path was the
        # one place still ignoring it.
        self.latest: str | None = None

    def subscribe(self) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue(maxsize=self.maxsize)
        self.clients.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[str]) -> None:
        self.clients.discard(q)

    def publish(self, payload: str) -> None:
        self.latest = payload
        for q in list(self.clients):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                self.dropped += 1      # a slow viewer simply misses a frame

    def publish_threadsafe(self, loop: asyncio.AbstractEventLoop, payload: str) -> None:
        loop.call_soon_threadsafe(self.publish, payload)

    @property
    def count(self) -> int:
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


# ── SSE, compressed ─────────────────────────────────────────────────────────
#
# GZipMiddleware is left to the ordinary JSON responses and kept away from the
# stream. A generic compressor is allowed to buffer until it has enough input to
# be worth a block, and on a feed that sends 4.5 KB every two seconds that
# buffering is indistinguishable from the race having stopped — which is the one
# thing this page must never imply. So the stream owns its compressor and flushes
# it at every frame boundary: Z_SYNC_FLUSH emits a complete block and leaves the
# dictionary intact, so the next frame still compresses against everything sent
# so far. Roughly 26 KB to 4.5 KB, measured on the Baku snapshot.

SSE_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",     # tell any proxy in front not to undo this
}
KEEPALIVE_S = 15.0                  # a comment frame, so idle connections survive


def _wants_gzip(request: Request) -> bool:
    return "gzip" in request.headers.get("accept-encoding", "").lower()


async def sse_response(request: Request, state: RaceState, hub: Hub, feed: "LiveFeed | None") -> StreamingResponse:
    gzip_it = _wants_gzip(request)
    headers = dict(SSE_HEADERS)
    if gzip_it:
        headers["Content-Encoding"] = "gzip"
        headers["Vary"] = "Accept-Encoding"

    async def frames():
        q = hub.subscribe()
        # wbits 16+15 asks zlib for a gzip wrapper rather than a raw deflate stream.
        compressor = zlib.compressobj(6, zlib.DEFLATED, 16 + zlib.MAX_WBITS) if gzip_it else None

        def encode(text: str) -> bytes:
            raw = text.encode()
            if compressor is None:
                return raw
            return compressor.compress(raw) + compressor.flush(zlib.Z_SYNC_FLUSH)

        try:
            # The last published frame, at most PUSH_INTERVAL_S old. Only the
            # first viewer of a fresh process pays to render one, and it pays in
            # a worker thread rather than on the loop.
            first = hub.latest
            if first is None:
                first = await asyncio.to_thread(
                    lambda: json.dumps(snapshot_payload(state, hub, feed), default=str))
                hub.latest = first
            yield encode(f"data: {first}\n\n")
            while True:
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=KEEPALIVE_S)
                    yield encode(f"data: {payload}\n\n")
                except asyncio.TimeoutError:
                    yield encode(": keep-alive\n\n")
        except asyncio.CancelledError:
            raise                      # the viewer went away; not an error
        finally:
            hub.unsubscribe(q)

    return StreamingResponse(frames(), headers=headers)


PRO_REQUIRED_BODY = {
    "error": {
        "code": "PRO_REQUIRED",
        "message": "Live mode is part of Pit Wall IQ PRO. It needs an access code.",
        "details": {"live": True},
    }
}


def bearer(request: Request) -> str:
    scheme, _, value = (request.headers.get("authorization") or "").partition(" ")
    return value.strip() if scheme.lower() == "bearer" else ""


def has_pro_access(request: Request) -> bool:
    """
    The same check the API makes, via the same verifier.

    decode_token() fails closed on everything: no secret configured, wrong
    version, tampered payload, bad signature, expired, or a code since revoked.
    A live server deployed without PRO_TOKEN_SECRET therefore serves nobody,
    which is the correct direction for a gate to fail.
    """
    return decode_token(bearer(request)) is not None


LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def is_loopback(host: str) -> bool:
    return host in LOOPBACK_HOSTS


def build_app(state: RaceState, hub: Hub, feed: "LiveFeed | None",
              push_interval: float = PUSH_INTERVAL_S, dev_routes: bool = False) -> Starlette:
    page = HERE / "live_view.html"

    def session_mismatch(wanted: int) -> dict | None:
        """A page asking for a session this process is not following."""
        running = state.session_key
        if running is None or running == wanted:
            return None
        return {
            "error": "SESSION_NOT_LIVE",
            "message": f"This live server is following session {running}, not {wanted}.",
            "session_key": running,
        }

    async def snapshot_route(request: Request) -> Response:
        if not has_pro_access(request):
            return JSONResponse(PRO_REQUIRED_BODY, status_code=402)
        wanted = int(request.path_params["session_key"])
        mismatch = session_mismatch(wanted)
        if mismatch:
            return JSONResponse(mismatch, status_code=409)
        return JSONResponse(snapshot_payload(state, hub, feed))

    async def stream_route(request: Request) -> Response:
        # Checked before the session, so an unauthenticated caller cannot learn
        # which session this server is following by reading the 409.
        if not has_pro_access(request):
            return JSONResponse(PRO_REQUIRED_BODY, status_code=402)
        wanted = int(request.path_params["session_key"])
        mismatch = session_mismatch(wanted)
        if mismatch:
            return JSONResponse(mismatch, status_code=409)
        return await sse_response(request, state, hub, feed)

    async def events_route(request: Request) -> Response:
        return await sse_response(request, state, hub, feed)

    async def snapshot_json(request: Request) -> Response:
        return JSONResponse(snapshot_payload(state, hub, feed))

    async def health(request: Request) -> Response:
        return JSONResponse({
            "ok": True,
            "session_key": state.session_key,
            "mode": "mqtt" if feed else "replay",
            "viewers": hub.count,
            "frames_dropped": hub.dropped,
        })

    async def index(request: Request) -> Response:
        if not page.exists():
            return Response("live_view.html is missing", status_code=500, media_type="text/plain")
        return FileResponse(page, media_type="text/html; charset=utf-8",
                            headers={"Cache-Control": "no-store"})

    async def pusher() -> None:
        """
        One task builds the snapshot; every viewer is sent the same string.

        The alternative — each connection rendering its own — recomputes the
        whole analysis per viewer per frame, which is the cost that actually
        grows with the audience.
        """
        while True:
            await asyncio.sleep(push_interval)
            try:
                payload = await asyncio.to_thread(
                    lambda: json.dumps(snapshot_payload(state, hub, feed), default=str))
                hub.publish(payload)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log("BUG!", f"pusher: {type(exc).__name__}: {exc}")

    @contextlib.asynccontextmanager
    async def lifespan(_app: Starlette):
        task = asyncio.create_task(pusher())
        try:
            yield
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    middleware = [
        Middleware(
            CORSMiddleware,
            allow_origins=list(ALLOWED_ORIGINS),
            allow_origin_regex=LOCAL_ORIGIN_RE,
            allow_methods=["GET"],
            allow_headers=["Content-Type", "Authorization"],
        ),
        # The stream sets its own Content-Encoding, so this passes it through
        # untouched and compresses the ordinary responses.
        Middleware(GZipMiddleware, minimum_size=500),
    ]

    routes = [
        Route("/live/{session_key:int}/snapshot", snapshot_route),
        Route("/live/{session_key:int}/stream", stream_route),
        Route("/health", health),
    ]
    if dev_routes:
        # Unauthenticated. Only ever reachable from this machine — see the
        # module docstring.
        routes += [
            Route("/events", events_route),
            Route("/snapshot.json", snapshot_json),
            Route("/", index),
        ]

    return Starlette(
        routes=routes,
        middleware=middleware,
        lifespan=lifespan,
    )


def snapshot_payload(state: RaceState, hub: Hub, feed: LiveFeed | None) -> dict:
    snap = state.snapshot(include_analysis=True)
    snap["feed"].update({
        "mode": "mqtt" if feed else "replay",
        "connected": bool(feed.connected) if feed else True,
        "token_expires_in_s": round(feed.token_expires_in) if feed else None,
        "renewals": feed.renewals if feed else 0,
        "browsers": hub.count,
    })
    return snap


def main() -> int:
    ap = argparse.ArgumentParser(description="Live snapshot server (isolated from the recorder).")
    ap.add_argument("--port", type=int, default=8099)
    ap.add_argument("--host", default="127.0.0.1",
                    help="0.0.0.0 to serve beyond this machine; leave it local otherwise")
    ap.add_argument("--replay-capture", metavar="DIR",
                    help="no MQTT: replay a recorder capture directory at its real arrival "
                         "times, so the page sees the race exactly as it was published")
    ap.add_argument("--speed", type=float, default=1.0,
                    help="capture replay speed multiplier (1 = real time, 60 = a minute a "
                         "race-hour). Feed outages are scaled with everything else.")
    ap.add_argument("--replay", type=int, metavar="SESSION_KEY",
                    help="no MQTT: replay a cached REST session (no real arrival times)")
    ap.add_argument("--replay-speed", type=float, default=0.02,
                    help="cached-session replay: seconds to sleep every 50 events")
    args = ap.parse_args()

    state = RaceState(session_key=args.replay)
    hub = Hub()
    feed: LiveFeed | None = None

    if args.replay_capture:
        cap = Path(args.replay_capture)
        log("MODE", f"capture replay of {cap} at {args.speed}x real time (no MQTT)")

        def run_capture():
            info = replay_capture(cap, state, speed=args.speed)
            log("REPLAY", f"capture finished: {info['events_fed']} events, "
                          f"reached lap {info['reached_lap']}, "
                          f"{len(info['gaps_observed'])} feed gap(s) reproduced")
        threading.Thread(target=run_capture, daemon=True).start()
    elif args.replay:
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

    dev_routes = is_loopback(args.host)
    app = build_app(state, hub, feed, dev_routes=dev_routes)
    log("SERVE", f"http://{args.host}:{args.port}/  (Ctrl+C to stop)")
    log("ACCESS", "live routes require a PRO token"
                  + (" · unauthenticated dev routes on (loopback bind)" if dev_routes
                     else " · dev routes off (not bound to loopback)"))
    if not settings.pro_token_secret.get_secret_value():
        log("ACCESS!", "PRO_TOKEN_SECRET is not set — no token can verify, so every "
                       "live request will be refused")
    config = uvicorn.Config(
        app,
        host=args.host,
        port=args.port,
        log_level="warning",       # our own log is the interesting one
        access_log=False,
        timeout_graceful_shutdown=3,
    )
    try:
        uvicorn.Server(config).run()
    except KeyboardInterrupt:
        print()
        log("STOP", "shutting down")
    finally:
        if feed:
            feed.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
