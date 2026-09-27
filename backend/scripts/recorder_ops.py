"""
The three things the recorder needs in production and does not need on a laptop:
a health endpoint Render can act on, an alert when the broker is lost, and an
upload of the finished capture to storage that outlives the container.

Kept out of live_recorder.py because none of it is recording. The recorder's job
is to get bytes onto disk and it should stay readable as that; if anything here
raises, the recording must continue regardless, which is why every entry point
below swallows its own exceptions and says so in the log.

    from recorder_ops import RecorderOps
    ops = RecorderOps(recorder, session_key=11727)
    ops.start()                      # health server + watchdog thread
    ops.saw_race_control(message)    # called per race_control message
    ops.stop()

── the health check, and why it is not "is the socket up" ───────────────────

Render restarts an instance whose health check fails. That makes a naive check
actively harmful here: the Baku recording survived three broker drops (4.0 s,
4.5 s and 28.6 s) precisely because paho reconnected on its own while the
process kept its file handles and its position. A check that returned 503 at
five seconds would have turned each of those into a container restart — slower
to recover than the reconnect it interrupted, and a restart during a session is
the one event this whole service exists to avoid.

So the endpoint reports unhealthy only once the connection has been down longer
than any recovery paho has ever managed here, by a wide margin. Below that it
reports 200 and says "degraded" in the body, which is for a human reading it,
not for the platform acting on it.

The other half of the same argument: it must not report 200 merely because the
process is alive. A recorder that is running and not subscribed writes nothing,
and looks identical from the outside to one recording a quiet session. That is
the failure this endpoint is for.
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable

# Word-bounded, as a project rule: "CHEQUERED FLAG" contains "RED FLAG", and
# matching flags by substring has produced a bug in this repo twice.
CHEQUERED = re.compile(r"\bCHEQUERED\b", re.IGNORECASE)

# Down longer than this and the health endpoint reports unhealthy. Well above
# the worst reconnect actually observed (28.6 s at Baku) so that a reconnect
# paho can manage is never interrupted by a platform restart.
UNHEALTHY_AFTER_S = 180.0

# Down longer than this during a session and a human is told. Shorter than the
# health threshold on purpose: the alert is information, the restart is an
# intervention, and the first should come well before the second.
ALERT_AFTER_S = 120.0

# After the chequered flag, wait this long before archiving: the feed keeps
# publishing for several minutes (Baku's last race_control message arrived
# 28 minutes after the flag) and an archive taken too early is incomplete.
ARCHIVE_SETTLE_S = 900.0


def iso(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).isoformat(timespec="seconds")


@dataclass
class OpsState:
    """What the endpoint and the watchdog both read. One writer per field."""
    session_key: int | None = None
    session_label: str = "unknown session"
    started: float = field(default_factory=time.time)
    chequered_at: float | None = None
    archived_at: float | None = None
    archive_url: str | None = None
    archive_error: str | None = None
    alerts_sent: int = 0
    last_alert_at: float | None = None


class RecorderOps:
    """Health, alerting and archiving for one Recorder instance."""

    def __init__(
        self,
        recorder: Any,
        session_key: int | None = None,
        session_label: str | None = None,
        port: int | None = None,
        unhealthy_after_s: float = UNHEALTHY_AFTER_S,
        alert_after_s: float = ALERT_AFTER_S,
        archive_settle_s: float = ARCHIVE_SETTLE_S,
        archive: Callable[[Path], str] | None = None,
        notify: Callable[[str], bool] | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.recorder = recorder
        self.state = OpsState(session_key=session_key,
                              session_label=session_label or f"session {session_key or '?'}")
        self.port = port if port is not None else int(os.environ.get("PORT", "0") or 0)
        self.unhealthy_after_s = unhealthy_after_s
        self.alert_after_s = alert_after_s
        self.archive_settle_s = archive_settle_s
        self._archive = archive if archive is not None else upload_capture
        self._notify = notify if notify is not None else notify_telegram
        self.clock = clock

        self._down_since: float | None = None
        self._alerted_for_this_outage = False
        self._server: ThreadingHTTPServer | None = None
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []

    # ── what the recorder calls ──────────────────────────────────────────────

    def session_started(self, directory: Path, session_key: int) -> None:
        """A new session's directory is open. Resets the per-session state."""
        self.state.session_key = session_key
        self.state.session_label = f"session {session_key}"
        self.state.chequered_at = None
        self.state.archived_at = None
        self.state.archive_url = None
        self.state.archive_error = None
        self._send(f"🟢 <b>Recording started</b>\n{self.state.session_label} → {directory}")

    def session_ended(self, directory: Path, session_key: int) -> None:
        """
        The previous session's directory is closed and complete. Archive it now
        rather than waiting for the settle timer: the roll is a stronger signal
        than the chequered flag, because it means the feed has already moved on.
        """
        if self.state.archived_at is not None:
            return
        self.archive_now(directory=directory, label=f"session {session_key}")

    def saw_race_control(self, message: dict) -> None:
        """Note the chequered flag. Safe to call on every race_control message."""
        if self.state.chequered_at is not None:
            return
        for field_name in ("message", "flag"):
            value = message.get(field_name)
            if isinstance(value, str) and CHEQUERED.search(value):
                self.state.chequered_at = self.clock()
                self.recorder.event(
                    "FLAG", f"chequered flag seen — archiving in "
                            f"{self.archive_settle_s / 60:.0f}m once the feed settles")
                return

    # ── health ───────────────────────────────────────────────────────────────

    def down_for(self) -> float:
        """Seconds the broker connection has been down, 0.0 when it is up."""
        if getattr(self.recorder, "connected", False):
            return 0.0
        if self._down_since is None:
            return 0.0
        return max(0.0, self.clock() - self._down_since)

    def health(self) -> tuple[int, dict]:
        """
        (status code, body). 503 only past unhealthy_after_s — see the module
        docstring for why a stricter check would cost more than it saves.
        """
        connected = bool(getattr(self.recorder, "connected", False))
        down = self.down_for()
        healthy = connected or down < self.unhealthy_after_s
        body = {
            "ok": healthy,
            "broker": "connected" if connected else "disconnected",
            "state": "healthy" if connected else ("degraded" if healthy else "unhealthy"),
            "down_for_s": round(down, 1) if not connected else 0.0,
            "unhealthy_after_s": self.unhealthy_after_s,
            "session_key": self.state.session_key,
            "session": self.state.session_label,
            "messages": getattr(self.recorder, "total", 0),
            "subscribed_topics": len(getattr(self.recorder, "subscribed_ok", []) or []),
            "reconnects": getattr(self.recorder, "disconnect_count", 0),
            "renewals": getattr(self.recorder, "renewals", 0),
            "callback_errors": getattr(self.recorder, "callback_errors", 0),
            "write_errors": getattr(self.recorder, "write_errors", 0),
            "uptime_s": round(self.clock() - self.state.started, 1),
            "chequered_at": iso(self.state.chequered_at) if self.state.chequered_at else None,
            "archived_at": iso(self.state.archived_at) if self.state.archived_at else None,
            "archive_url": self.state.archive_url,
            "archive_error": self.state.archive_error,
        }
        return (200 if healthy else 503), body

    # ── the watchdog ─────────────────────────────────────────────────────────

    def tick(self) -> None:
        """One pass. Tracks the outage, alerts once per outage, archives once."""
        now = self.clock()
        connected = bool(getattr(self.recorder, "connected", False))

        if connected:
            if self._down_since is not None and self._alerted_for_this_outage:
                self._send(
                    f"✅ <b>Recorder reconnected</b>\n"
                    f"{self.state.session_label} — the broker connection came back after "
                    f"{now - self._down_since:.0f}s. Recording continues; the gap is in the "
                    f"event log."
                )
            self._down_since = None
            self._alerted_for_this_outage = False
        else:
            if self._down_since is None:
                self._down_since = now
            elif not self._alerted_for_this_outage and now - self._down_since >= self.alert_after_s:
                self._alerted_for_this_outage = True
                self._send(
                    f"🔴 <b>Recorder has lost the broker</b>\n"
                    f"{self.state.session_label} — no MQTT connection for "
                    f"{now - self._down_since:.0f}s. Whatever is published in the meantime is "
                    f"gone: OpenF1 has no replay.\n"
                    f"Render marks the service unhealthy at "
                    f"{self.unhealthy_after_s:.0f}s and will restart it."
                )

        if (
            self.state.chequered_at is not None
            and self.state.archived_at is None
            and self.state.archive_error is None
            and now - self.state.chequered_at >= self.archive_settle_s
        ):
            self.archive_now()

    def archive_now(self, directory: Path | None = None, label: str | None = None) -> None:
        """Upload the capture. Never raises: a failed upload keeps the disk copy."""
        target = Path(directory or self.recorder.dir)
        name = label or self.state.session_label
        try:
            self.recorder.flush_all()
            url = self._archive(target)
            self.state.archived_at = self.clock()
            self.state.archive_url = url
            self.recorder.event("ARCHIVE", f"capture uploaded to {url}")
            self._send(f"📦 <b>Capture archived</b>\n{name}\n{url}")
        except Exception as exc:
            self.state.archive_error = f"{type(exc).__name__}: {exc}"
            self.recorder.event("ARCHIVE!", f"upload failed: {self.state.archive_error} — "
                                            f"the capture is still on the disk",
                                traceback=traceback.format_exc())
            self._send(
                f"⚠️ <b>Capture upload failed</b>\n{name}\n"
                f"{self.state.archive_error}\n"
                f"The recording itself is intact on the service's disk."
            )

    def _send(self, text: str) -> None:
        self.state.alerts_sent += 1
        self.state.last_alert_at = self.clock()
        try:
            self._notify(text)
        except Exception as exc:          # an alert must never stop a recording
            self.recorder.event("ALERT!", f"could not notify: {type(exc).__name__}: {exc}")

    # ── lifecycle ────────────────────────────────────────────────────────────

    def start(self) -> None:
        self._threads.append(self._spawn(self._watchdog_loop, "ops-watchdog"))
        if self.port:
            self._start_health_server()
        else:
            self.recorder.event("OPS", "no PORT set — health endpoint not served "
                                       "(fine on a laptop, wrong on Render)")

    def _spawn(self, target, name: str) -> threading.Thread:
        t = threading.Thread(target=target, name=name, daemon=True)
        t.start()
        return t

    def _watchdog_loop(self) -> None:
        while not self._stop.wait(5.0):
            try:
                self.tick()
            except Exception as exc:
                self.recorder.event("BUG!", f"ops watchdog: {type(exc).__name__}: {exc}",
                                    traceback=traceback.format_exc())

    def _start_health_server(self) -> None:
        ops = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, fmt, *args):
                pass                      # the recorder's own log is the one to read

            def do_GET(self):
                path = self.path.split("?", 1)[0]
                if path in ("/health", "/", "/status"):
                    code, body = ops.health()
                    # /status is for a human: never fails, whatever the state.
                    if path == "/status":
                        code = 200
                    raw = json.dumps(body, indent=2).encode()
                    self.send_response(code)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(raw)))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(raw)
                    return
                self.send_response(404)
                self.send_header("Content-Length", "0")
                self.end_headers()

        self._server = ThreadingHTTPServer(("0.0.0.0", self.port), Handler)
        self._server.daemon_threads = True
        self._threads.append(self._spawn(self._server.serve_forever, "ops-health"))
        self.recorder.event("OPS", f"health endpoint on :{self.port}/health "
                                   f"(503 after {self.unhealthy_after_s:.0f}s without the broker)")

    def stop(self) -> None:
        self._stop.set()
        if self._server:
            try:
                self._server.shutdown()
                self._server.server_close()
            except Exception:
                pass


# ── the archive ──────────────────────────────────────────────────────────────

def upload_capture(directory: Path) -> str:
    """
    Upload the capture as one tar.gz to S3-compatible storage. Returns its URL.

    Configured by CAPTURE_BUCKET, CAPTURE_ENDPOINT_URL and the usual
    AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY. Written against the S3 API rather
    than any provider's own so the bucket can move between R2, B2 and S3 with an
    endpoint change and nothing else.

    One object per session, not one per topic: the capture is only ever consumed
    whole, by replay_capture(), and a single compressed object is one request to
    write and one to read. Baku's 25 MB compresses to a few MB of JSON.
    """
    import io
    import tarfile

    bucket = os.environ.get("CAPTURE_BUCKET", "").strip()
    if not bucket:
        raise RuntimeError("CAPTURE_BUCKET is not set — nowhere to upload to")

    import boto3       # imported here so the recorder runs without it locally

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for path in sorted(directory.glob("*.jsonl")):
            tar.add(path, arcname=f"{directory.name}/{path.name}")
    buf.seek(0)
    payload = buf.getvalue()

    key = f"captures/{directory.name}.tar.gz"
    client = boto3.client(
        "s3",
        endpoint_url=os.environ.get("CAPTURE_ENDPOINT_URL") or None,
        region_name=os.environ.get("CAPTURE_REGION", "auto"),
    )
    client.put_object(Bucket=bucket, Key=key, Body=payload,
                      ContentType="application/gzip")
    return f"{bucket}/{key} ({len(payload) / 1048576:.1f} MB)"


def notify_telegram(text: str) -> bool:
    """
    Send one message, reusing the sender the publication Action already uses.

    Same credentials, same HTML formatting, same refusal to ever raise: a
    notification that fails must not take a recording with it.
    """
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from notify_telegram import send

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        print(f"[ALERT  ] telegram not configured; message was:\n{text}", flush=True)
        return False
    return send(token, chat_id, text)
