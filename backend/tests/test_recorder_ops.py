"""
The recorder's production behaviour: health, alerting, archiving.

The health check is the one with a trap in it. Render restarts an instance whose
health check fails, so a check that reports unhealthy the moment the socket
drops turns every reconnect into a container restart — slower to recover than
the reconnect it interrupts, and a restart mid-session is the event the whole
service exists to avoid. The Baku recording survived drops of 4.0 s, 4.5 s and
28.6 s precisely because paho reconnected while the process kept its handles.

So these tests pin both directions: brief outages must stay healthy, and a
process that is alive but not connected must not.
"""
from __future__ import annotations

import importlib.util
import sys
import tarfile
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))

spec = importlib.util.spec_from_file_location("recorder_ops", BACKEND / "scripts" / "recorder_ops.py")
recorder_ops = importlib.util.module_from_spec(spec)
sys.modules["recorder_ops"] = recorder_ops
spec.loader.exec_module(recorder_ops)

RecorderOps = recorder_ops.RecorderOps


class FakeRecorder:
    """Only what RecorderOps touches."""

    def __init__(self, directory: Path) -> None:
        self.dir = directory
        self.connected = True
        self.total = 1234
        self.subscribed_ok = [1] * 10
        self.disconnect_count = 0
        self.renewals = 0
        self.callback_errors = 0
        self.write_errors = 0
        self.events: list[tuple[str, str]] = []
        self.flushed = 0

    def event(self, kind: str, msg: str, **fields) -> None:
        self.events.append((kind, msg))

    def flush_all(self) -> None:
        self.flushed += 1


@pytest.fixture()
def rig(tmp_path):
    clock = {"t": 1000.0}
    sent: list[str] = []
    archived: list[Path] = []

    directory = tmp_path / "11727"
    directory.mkdir()
    (directory / "laps.jsonl").write_text('{"a": 1}\n')
    (directory / "race_control.jsonl").write_text('{"b": 2}\n')

    recorder = FakeRecorder(directory)
    ops = RecorderOps(
        recorder,
        session_key=11727,
        session_label="Kuala Lumpur FP1",
        port=0,
        notify=lambda text: (sent.append(text), True)[1],
        archive=lambda d: (archived.append(d), f"bucket/{d.name}.tar.gz")[1],
        clock=lambda: clock["t"],
    )
    return ops, recorder, clock, sent, archived


# ── health ───────────────────────────────────────────────────────────────────

def test_a_connected_recorder_is_healthy(rig):
    ops, _, _, _, _ = rig
    code, body = ops.health()
    assert code == 200
    assert body["ok"] is True
    assert body["state"] == "healthy"
    assert body["broker"] == "connected"


def test_a_brief_outage_stays_healthy_so_render_does_not_restart_it(rig):
    """The 28.6 s drop at Baku must not become a container restart."""
    ops, recorder, clock, _, _ = rig
    recorder.connected = False
    ops.tick()                       # notices the outage starting
    clock["t"] += 28.6
    code, body = ops.health()
    assert code == 200, "a reconnect paho can manage must not be interrupted"
    assert body["state"] == "degraded"
    assert body["down_for_s"] == pytest.approx(28.6, abs=0.2)


def test_a_long_outage_reports_unhealthy(rig):
    ops, recorder, clock, _, _ = rig
    recorder.connected = False
    ops.tick()
    clock["t"] += recorder_ops.UNHEALTHY_AFTER_S + 1
    code, body = ops.health()
    assert code == 503
    assert body["ok"] is False
    assert body["state"] == "unhealthy"


def test_health_reports_the_broker_not_merely_that_the_process_is_alive(rig):
    """
    The failure this endpoint exists for: a recorder running and subscribed to
    nothing looks identical from outside to one recording a quiet session.
    """
    ops, recorder, clock, _, _ = rig
    recorder.connected = False
    ops.tick()
    clock["t"] += 1000
    code, body = ops.health()
    assert code == 503
    assert body["broker"] == "disconnected"


# ── alerting ─────────────────────────────────────────────────────────────────

def test_a_short_outage_does_not_wake_anyone(rig):
    ops, recorder, clock, sent, _ = rig
    recorder.connected = False
    ops.tick()
    clock["t"] += 30
    ops.tick()
    assert sent == []


def test_a_long_outage_alerts_once_not_once_per_tick(rig):
    ops, recorder, clock, sent, _ = rig
    recorder.connected = False
    ops.tick()
    clock["t"] += recorder_ops.ALERT_AFTER_S + 1
    for _ in range(5):
        ops.tick()
        clock["t"] += 10
    assert len(sent) == 1
    assert "lost the broker" in sent[0]


def test_recovery_is_reported_only_if_the_loss_was(rig):
    ops, recorder, clock, sent, _ = rig
    recorder.connected = False
    ops.tick()
    clock["t"] += recorder_ops.ALERT_AFTER_S + 1
    ops.tick()
    recorder.connected = True
    ops.tick()
    assert len(sent) == 2
    assert "reconnected" in sent[1]

    # A second short outage afterwards is silent again.
    recorder.connected = False
    ops.tick()
    clock["t"] += 10
    recorder.connected = True
    ops.tick()
    assert len(sent) == 2


def test_an_alert_that_fails_never_stops_the_recording(rig, tmp_path):
    ops, recorder, clock, _, _ = rig

    def explode(text):
        raise RuntimeError("telegram is down")

    ops._notify = explode
    recorder.connected = False
    ops.tick()
    clock["t"] += recorder_ops.ALERT_AFTER_S + 1
    ops.tick()          # must not raise
    assert any(kind == "ALERT!" for kind, _ in recorder.events)


# ── the chequered flag and the archive ───────────────────────────────────────

def test_the_chequered_flag_is_word_bounded(rig):
    ops, _, _, _, _ = rig
    ops.saw_race_control({"message": "RED FLAG"})
    assert ops.state.chequered_at is None
    ops.saw_race_control({"message": "CHEQUERED FLAG"})
    assert ops.state.chequered_at is not None


def test_the_archive_waits_for_the_feed_to_settle(rig):
    """
    Baku's last race_control message arrived 28 minutes after the flag. An
    archive taken at the flag is an incomplete capture.
    """
    ops, _, clock, _, archived = rig
    ops.saw_race_control({"message": "CHEQUERED FLAG"})
    clock["t"] += 60
    ops.tick()
    assert archived == []
    clock["t"] += recorder_ops.ARCHIVE_SETTLE_S
    ops.tick()
    assert len(archived) == 1


def test_the_archive_happens_once(rig):
    ops, _, clock, _, archived = rig
    ops.saw_race_control({"message": "CHEQUERED FLAG"})
    clock["t"] += recorder_ops.ARCHIVE_SETTLE_S + 1
    for _ in range(4):
        ops.tick()
    assert len(archived) == 1


def test_rolling_to_a_new_session_archives_the_finished_one(rig, tmp_path):
    """The roll is a stronger signal than the flag: the feed has moved on."""
    ops, _, _, sent, archived = rig
    previous = tmp_path / "11727"
    ops.session_ended(previous, 11727)
    assert archived == [previous]
    assert any("archived" in s.lower() for s in sent)


def test_a_new_session_resets_the_previous_ones_state(rig, tmp_path):
    ops, _, _, _, _ = rig
    ops.saw_race_control({"message": "CHEQUERED FLAG"})
    assert ops.state.chequered_at is not None
    ops.session_started(tmp_path / "11728", 11728)
    assert ops.state.session_key == 11728
    assert ops.state.chequered_at is None
    assert ops.state.archived_at is None


def test_a_failed_upload_keeps_the_disk_copy_and_says_so(rig):
    ops, recorder, clock, sent, _ = rig

    def explode(directory):
        raise OSError("bucket unreachable")

    ops._archive = explode
    ops.saw_race_control({"message": "CHEQUERED FLAG"})
    clock["t"] += recorder_ops.ARCHIVE_SETTLE_S + 1
    ops.tick()                      # must not raise
    assert ops.state.archive_error and "OSError" in ops.state.archive_error
    # Both the log and the alert must say the recording survived the failure.
    assert any("still on the disk" in msg for _, msg in recorder.events)
    assert any("intact on the service" in s for s in sent)
    # and it does not retry forever on every tick
    ops.tick()
    assert ops.state.archive_error


def test_the_upload_packs_every_jsonl_and_nothing_else(tmp_path, monkeypatch):
    directory = tmp_path / "11727"
    directory.mkdir()
    (directory / "laps.jsonl").write_text('{"a": 1}\n')
    (directory / "_events.jsonl").write_text('{"kind": "START"}\n')
    (directory / "notes.txt").write_text("not part of the capture")

    captured = {}

    class FakeClient:
        def put_object(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setenv("CAPTURE_BUCKET", "pitwall-captures")
    monkeypatch.setitem(sys.modules, "boto3",
                        type("boto3", (), {"client": staticmethod(lambda *a, **k: FakeClient())}))

    url = recorder_ops.upload_capture(directory)

    assert captured["Bucket"] == "pitwall-captures"
    assert captured["Key"] == "captures/11727.tar.gz"
    body = captured["Body"]
    import io
    with tarfile.open(fileobj=io.BytesIO(body), mode="r:gz") as tar:
        names = sorted(Path(n).name for n in tar.getnames())
    assert names == ["_events.jsonl", "laps.jsonl"]
    assert "11727" in url


def test_upload_without_a_bucket_is_an_error_not_a_silent_success(tmp_path, monkeypatch):
    monkeypatch.delenv("CAPTURE_BUCKET", raising=False)
    with pytest.raises(RuntimeError, match="CAPTURE_BUCKET"):
        recorder_ops.upload_capture(tmp_path)
