"""
OpenF1 live-session recorder — capture the MQTT stream to disk. Nothing else.

    python scripts/live_recorder.py --out live/2026-09-26_race
    python scripts/live_recorder.py --out live/... --with-car-data --with-location

It does not touch the API, the cache or the analysis pipeline: one JSONL file
per topic, append-only, flushed as it goes, plus an event log. Relaunching
against the same directory appends; nothing is ever overwritten.

Design notes, in order of how much they matter:

1. Token renewal. The OAuth2 token lives 3600 s and a race lasts longer. MQTT
   has no way to change the password of a live connection, so renewal means
   reconnecting: fetch the new token first (so the socket is only down for the
   reconnect itself), then disconnect, reconnect, resubscribe. Every step is
   logged with its exact instant and the measured gap, so the hole in the data
   can be located afterwards.

2. Callback safety. paho runs callbacks on its network thread and swallows any
   exception raised there — a bug looks exactly like the broker going quiet.
   Every callback body is wrapped by @guard, which logs the full traceback and
   counts the failure.

3. Nothing in memory. Each message is written and flushed immediately (high-rate
   topics are flushed on a 0.25 s gate so car_data cannot stall the loop). A
   network drop, a kill or a crash can only lose what the OS had buffered.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import signal
import ssl
import sys
import threading
import time
import traceback
from collections import Counter
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

sys.path.insert(0, ".")

import paho.mqtt.client as mqtt  # noqa: E402
from paho.mqtt.enums import CallbackAPIVersion  # noqa: E402

from app.clients.openf1_auth import OpenF1CredentialsError, token_manager  # noqa: E402
from app.core.config import settings  # noqa: E402

BROKER_HOST = "mqtt.openf1.org"
BROKER_PORT = 8883
QOS = 1

# Subscribed by default: low rate, one document per event.
TOPICS = [
    "v1/laps",
    "v1/pit",
    "v1/position",
    "v1/intervals",
    "v1/race_control",
    "v1/weather",
    "v1/stints",
    "v1/drivers",
    "v1/team_radio",
    "v1/session_result",
]
# ~3.7 Hz per car over 20 cars — gigabytes per race. Flags only.
TOPIC_CAR_DATA = "v1/car_data"
TOPIC_LOCATION = "v1/location"
HIGH_RATE = {TOPIC_CAR_DATA, TOPIC_LOCATION}

RENEW_BEFORE_S = 420.0      # reconnect with a new token this long before expiry
                            # (overridable with --renew-before, which is how the
                            #  renewal path is exercised without waiting 53 min)
HEARTBEAT_S = 30.0
FLUSH_GATE_S = 0.25         # high-rate topics: at most one flush per this interval
BACKOFF_S = [1, 2, 4, 8, 15, 30]


def iso(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).isoformat(timespec="milliseconds")


def hhmmss(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).strftime("%H:%M:%S")


def rc_int(reason_code) -> int:
    """paho 2.x hands back a ReasonCode object; 1.x an int."""
    return int(getattr(reason_code, "value", reason_code))


class Recorder:
    def __init__(self, out_dir: Path, topics: list[str], username: str,
                 renew_before_s: float = RENEW_BEFORE_S) -> None:
        self.dir = out_dir
        self.topics = topics
        self.username = username or "recorder"
        self.renew_before_s = renew_before_s
        self.dir.mkdir(parents=True, exist_ok=True)

        self._handles: dict[str, object] = {}
        self._last_flush: dict[str, float] = {}
        self._io_lock = threading.Lock()
        self.events = open(self.dir / "_events.jsonl", "a", encoding="utf-8")

        self.total = 0
        self.per_topic = Counter()
        self.since_hb = Counter()
        self.callback_errors = 0
        self.write_errors = 0
        self.connected = False
        self.connect_count = 0
        self.disconnect_count = 0
        self.renewals = 0
        self.token: str | None = None
        self.token_obtained_at = 0.0
        self.token_ttl = 0.0
        self.subscribed_ok: list[int] = []
        self.started = time.time()

        self._stop = threading.Event()
        self._renewing = threading.Event()
        self.client: mqtt.Client | None = None

    # ── logging ──────────────────────────────────────────────────────────────

    def event(self, kind: str, msg: str, **fields) -> None:
        """One line to the terminal and one JSON object to _events.jsonl."""
        now = time.time()
        line = f"[{kind:<7}] {hhmmss(now)} {msg}"
        print(line, flush=True)
        rec = {"_ts": now, "_iso": iso(now), "kind": kind, "message": msg, **fields}
        with self._io_lock:
            try:
                self.events.write(json.dumps(rec, default=str) + "\n")
                self.events.flush()
            except Exception:
                pass

    # ── writing ──────────────────────────────────────────────────────────────

    def _handle(self, topic: str):
        h = self._handles.get(topic)
        if h is None:
            name = topic.replace("v1/", "").replace("/", "_") or "unknown"
            h = open(self.dir / f"{name}.jsonl", "a", encoding="utf-8")
            self._handles[topic] = h
            self._last_flush[topic] = 0.0
        return h

    def write(self, topic: str, payload, recv: float) -> None:
        rec = {"_recv": recv, "_recv_iso": iso(recv), "topic": topic, "msg": payload}
        with self._io_lock:
            try:
                h = self._handle(topic)
                h.write(json.dumps(rec, default=str, ensure_ascii=False) + "\n")
                if topic not in HIGH_RATE or recv - self._last_flush[topic] >= FLUSH_GATE_S:
                    h.flush()
                    self._last_flush[topic] = recv
            except Exception as exc:
                self.write_errors += 1
                self.event("WRITE!", f"could not write {topic}: {type(exc).__name__}: {exc}")

    def flush_all(self) -> None:
        with self._io_lock:
            for h in self._handles.values():
                try:
                    h.flush()
                except Exception:
                    pass

    def close_all(self) -> None:
        self.flush_all()
        with self._io_lock:
            for topic, h in self._handles.items():
                try:
                    os.fsync(h.fileno())
                except Exception:
                    pass
                try:
                    h.close()
                except Exception:
                    pass
            self._handles.clear()
            try:
                self.events.flush()
                os.fsync(self.events.fileno())
                self.events.close()
            except Exception:
                pass

    # ── callbacks (all guarded: a bug here must never look like silence) ─────

    def guard(fn):  # noqa: N805
        @wraps(fn)
        def wrapper(self, *args, **kwargs):
            try:
                return fn(self, *args, **kwargs)
            except Exception as exc:
                self.callback_errors += 1
                tb = traceback.format_exc()
                self.event(
                    "BUG!", f"exception in {fn.__name__}: {type(exc).__name__}: {exc}",
                    callback=fn.__name__, traceback=tb,
                )
                print(tb, file=sys.stderr, flush=True)
        return wrapper

    @guard
    def on_connect(self, client, userdata, flags, reason_code, properties=None):
        rc = rc_int(reason_code)
        if rc == 0:
            self.connected = True
            self.connect_count += 1
            self.event("CONNECT", f"connected (rc=0), session_present={getattr(flags, 'session_present', '?')}", rc=rc)
            self.subscribe_all(client)
        else:
            self.connected = False
            self.event("CONNECT!", f"refused rc={rc} ({reason_code})", rc=rc)
            if rc in (4, 5, 134, 135):
                # Stale or rejected token: ask for a renewal on the main thread.
                self.event("CONNECT!", "reason looks like auth — flagging token refresh")
                self._force_renew = True

    @guard
    def on_disconnect(self, client, userdata, flags=None, reason_code=None, properties=None):
        rc = rc_int(reason_code) if reason_code is not None else -1
        self.connected = False
        self.disconnect_count += 1
        if self._stop.is_set():
            why, flag = " — deliberate, shutting down", False
        elif self._renewing.is_set():
            why, flag = " — deliberate, token renewal", False
        else:
            why, flag = " — unexpected, will reconnect", True
        self.event(
            "DISCONN!" if flag else "DISCONN",
            f"disconnected rc={rc} ({reason_code}){why}",
            rc=rc, deliberate=not flag,
        )

    @guard
    def on_subscribe(self, client, userdata, mid, reason_codes, properties=None):
        granted = [rc_int(c) for c in reason_codes]
        self.subscribed_ok = granted
        failed = [g for g in granted if g >= 128]
        self.event(
            "SUBSCRIBE" if not failed else "SUBSCRIBE!",
            f"mid={mid} granted={granted}" + (f" — {len(failed)} REFUSED" if failed else ""),
            granted=granted,
        )

    @guard
    def on_message(self, client, userdata, msg):
        recv = time.time()
        try:
            payload = json.loads(msg.payload)
        except Exception:
            payload = {"_unparsed": msg.payload.decode("utf-8", "replace")}
        self.total += 1
        self.per_topic[msg.topic] += 1
        self.since_hb[msg.topic] += 1
        self.write(msg.topic, payload, recv)

    # ── connection ───────────────────────────────────────────────────────────

    def subscribe_all(self, client) -> None:
        subs = [(t, QOS) for t in self.topics]
        result, mid = client.subscribe(subs)
        self.event("SUBSCRIBE", f"requested {len(subs)} topic(s), mid={mid}, result={result}",
                   topics=self.topics)

    def fetch_token(self) -> str:
        t0 = time.time()
        token = asyncio.run(token_manager.get_token())
        if not token:
            raise OpenF1CredentialsError("no token")
        self.token = token
        self.token_obtained_at = time.time()
        self.token_ttl = token_manager.seconds_left
        self.event("TOKEN", f"obtained in {time.time() - t0:.2f}s, {len(token)} chars, "
                            f"expires in {self.token_ttl:.0f}s",
                   ttl_s=round(self.token_ttl))
        return token

    def build_client(self) -> mqtt.Client:
        c = mqtt.Client(CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv311,
                        client_id=f"pitwall-rec-{int(time.time())}")
        c.username_pw_set(username=self.username, password=self.token)
        c.tls_set(cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS_CLIENT)
        c.reconnect_delay_set(min_delay=1, max_delay=30)
        c.on_connect = self.on_connect
        c.on_disconnect = self.on_disconnect
        c.on_subscribe = self.on_subscribe
        c.on_message = self.on_message
        return c

    def _teardown_client(self) -> None:
        """Stop and drop the current client so a retry cannot leave two alive."""
        c, self.client = self.client, None
        if c is None:
            return
        try:
            c.loop_stop()
        except Exception:
            pass
        try:
            c.disconnect()
        except Exception:
            pass

    def connect(self) -> None:
        self.client = self.build_client()
        self.client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
        self.client.loop_start()

    @property
    def token_expires_in(self) -> float:
        return max(0.0, self.token_ttl - (time.time() - self.token_obtained_at))

    def renew_and_reconnect(self, why: str) -> None:
        """
        The critical path. New token first, then swap the connection. The cut
        instant, the reconnect instant, the measured gap and the resubscribe
        result are all logged so the hole can be found in the data afterwards.
        """
        self.renewals += 1
        n = self.renewals
        self.event("RENEW", f"#{n} starting ({why}); current token expires in {self.token_expires_in:.0f}s")
        try:
            token_manager.clear()          # force a brand-new token, not the cached one
            self.fetch_token()
        except Exception as exc:
            self.event("RENEW!", f"#{n} could not obtain a new token: {type(exc).__name__}: {exc} — keeping the old connection")
            return

        old = self.client
        self._renewing.set()
        self.subscribed_ok = []
        cut = time.time()
        self.event("CUT", f"#{n} disconnecting at {iso(cut)} to swap credentials", at=cut)
        try:
            if old is not None:
                old.loop_stop()
                old.disconnect()
        except Exception as exc:
            self.event("CUT!", f"#{n} disconnect raised {type(exc).__name__}: {exc}")

        back = None
        for i, delay in enumerate(BACKOFF_S + [30] * 40):
            if self._stop.is_set():
                break
            try:
                self.connect()
            except Exception as exc:
                self.event("CUT!", f"#{n} reconnect attempt {i + 1} failed: {type(exc).__name__}: {exc}; retrying in {delay}s")
                self._teardown_client()
                time.sleep(delay)
                continue
            deadline = time.time() + 20
            while time.time() < deadline and not self.connected and not self._stop.is_set():
                time.sleep(0.05)
            if self.connected:
                back = time.time()
                break
            if self._stop.is_set():
                break
            # Never leave a half-open client behind: a second connect() without
            # this would leave two clients and duplicate every message.
            self.event("CUT!", f"#{n} no CONNACK within 20s; discarding that client and retrying in {delay}s")
            self._teardown_client()
            time.sleep(delay)

        self._renewing.clear()
        if back is None:
            if self._stop.is_set():
                self.event("CUT", f"#{n} renewal abandoned: shutting down (this is not a failure)")
            else:
                self.event("CUT!", f"#{n} RECONNECT FAILED — recorder is not receiving")
            return
        gap = back - cut
        self.event("CUT", f"#{n} reconnected at {iso(back)} — GAP {gap:.3f}s", at=back, gap_s=round(gap, 3))

        deadline = time.time() + 15
        while time.time() < deadline and not self.subscribed_ok:
            time.sleep(0.05)
        if self.subscribed_ok and all(g < 128 for g in self.subscribed_ok):
            self.event("CUT", f"#{n} resubscribed OK to {len(self.subscribed_ok)} topic(s) — renewal complete, gap {gap:.3f}s",
                       gap_s=round(gap, 3), granted=self.subscribed_ok)
        else:
            self.event("CUT!", f"#{n} RESUBSCRIBE NOT CONFIRMED (granted={self.subscribed_ok}) — data may be missing")

    # ── heartbeat ────────────────────────────────────────────────────────────

    def heartbeat(self) -> None:
        up = time.time() - self.started
        delta = " ".join(f"{t.replace('v1/', '')}+{n}" for t, n in self.since_hb.most_common())
        state = "OK" if self.connected else "DOWN"
        renew_in = max(0.0, self.token_expires_in - self.renew_before_s)
        bits = [
            f"up {up / 60:.0f}m",
            f"conn={state}",
            f"total={self.total} (+{sum(self.since_hb.values())})",
            f"renew in {renew_in / 60:.0f}m",
        ]
        if self.callback_errors or self.write_errors:
            bits.append(f"ERRORS cb={self.callback_errors} io={self.write_errors}")
        print(f"[HB     ] {hhmmss(time.time())} " + " · ".join(bits) + (f" · {delta}" if delta else " · no traffic"),
              flush=True)
        self.since_hb.clear()
        self.flush_all()

    # ── main loop ────────────────────────────────────────────────────────────

    def run(self) -> int:
        self._force_renew = False
        self.event("START", f"recorder starting · out={self.dir} · topics={len(self.topics)} · "
                            f"renew {self.renew_before_s / 60:.1f}m before expiry",
                   topics=self.topics, out=str(self.dir))
        try:
            self.fetch_token()
        except Exception as exc:
            self.event("START!", f"no token: {type(exc).__name__}: {exc}")
            return 1

        try:
            self.connect()
        except Exception as exc:
            self.event("START!", f"initial connect failed: {type(exc).__name__}: {exc}")
            return 2

        last_hb = time.time()
        down_since: float | None = None
        backoff_i = 0

        while not self._stop.is_set():
            time.sleep(0.5)
            now = time.time()

            if now - last_hb >= HEARTBEAT_S:
                last_hb = now
                try:
                    self.heartbeat()
                except Exception as exc:
                    self.event("BUG!", f"heartbeat raised {type(exc).__name__}: {exc}", traceback=traceback.format_exc())

            if self._force_renew:
                self._force_renew = False
                self.renew_and_reconnect("broker rejected the token")
                continue

            if not self._renewing.is_set() and self.token_expires_in <= self.renew_before_s:
                self.renew_and_reconnect("token approaching expiry")
                continue

            # paho retries on its own; this is the backstop for a socket that
            # never comes back (and it keeps the event log honest about gaps).
            if self.connected:
                if down_since is not None:
                    self.event("RECONN", f"connection restored after {now - down_since:.1f}s down", down_s=round(now - down_since, 1))
                    down_since, backoff_i = None, 0
            else:
                if down_since is None:
                    down_since = now
                elif now - down_since > BACKOFF_S[min(backoff_i, len(BACKOFF_S) - 1)] + 25:
                    backoff_i += 1
                    self.event("RECONN!", f"still down after {now - down_since:.0f}s — forcing a fresh client")
                    self.renew_and_reconnect("connection did not recover")

        self.event("STOP", "shutting down: flushing and closing files")
        try:
            if self.client is not None:
                self.client.loop_stop()
                self.client.disconnect()
        except Exception:
            pass
        self.summary()
        self.close_all()
        return 0

    def summary(self) -> None:
        up = time.time() - self.started
        self.event(
            "SUMMARY",
            f"up {up / 60:.1f}m · {self.total} messages · {self.connect_count} connect(s) · "
            f"{self.disconnect_count} disconnect(s) · {self.renewals} renewal(s) · "
            f"callback errors {self.callback_errors} · write errors {self.write_errors}",
            total=self.total, per_topic=dict(self.per_topic), up_s=round(up, 1),
            connects=self.connect_count, disconnects=self.disconnect_count,
            renewals=self.renewals, callback_errors=self.callback_errors,
            write_errors=self.write_errors,
        )
        for t, n in self.per_topic.most_common():
            print(f"           {t}: {n}", flush=True)

    def stop(self) -> None:
        self._stop.set()


def main() -> int:
    ap = argparse.ArgumentParser(description="Record the OpenF1 MQTT live stream to JSONL.")
    ap.add_argument("--out", required=True, help="output directory (created; relaunch appends)")
    ap.add_argument("--with-car-data", action="store_true", help="also record v1/car_data (~GB per race)")
    ap.add_argument("--with-location", action="store_true", help="also record v1/location (~GB per race)")
    ap.add_argument("--topic", action="append", default=[], help="extra topic (repeatable)")
    ap.add_argument("--renew-before", type=float, default=RENEW_BEFORE_S, metavar="SECONDS",
                    help="renew the token this many seconds before it expires "
                         f"(default {RENEW_BEFORE_S:.0f}; set near 3600 to exercise the renewal path)")
    ap.add_argument("--stop-after", type=float, default=0.0, metavar="SECONDS",
                    help="stop on its own after this long (0 = run until Ctrl+C)")
    args = ap.parse_args()

    if not token_manager.configured:
        print("FAIL: OPENF1_USERNAME / OPENF1_PASSWORD are not set.", flush=True)
        return 1

    topics = list(TOPICS)
    if args.with_car_data:
        topics.append(TOPIC_CAR_DATA)
    if args.with_location:
        topics.append(TOPIC_LOCATION)
    topics.extend(t for t in args.topic if t not in topics)

    rec = Recorder(Path(args.out), topics, settings.openf1_username, args.renew_before)
    if args.stop_after:
        threading.Timer(args.stop_after, rec.stop).start()

    def on_signal(signum, frame):
        print(flush=True)
        rec.event("SIGNAL", f"received {signal.Signals(signum).name} — stopping")
        rec.stop()

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)
    return rec.run()


if __name__ == "__main__":
    sys.exit(main())
