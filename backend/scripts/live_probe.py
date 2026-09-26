"""
PASO 0 — connectivity probe for OpenF1's MQTT stream. Reads nothing, writes
nothing: connects, subscribes, prints whatever arrives, exits.

    python scripts/live_probe.py [--topic v1/laps] [--seconds 30]

Credentials come from the same TokenManager the REST client uses
(OPENF1_USERNAME / OPENF1_PASSWORD); the OAuth2 access token is the MQTT
password. Exit 0 = connected (with or without traffic), 1 = auth refused,
2 = could not connect.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import ssl
import sys
import threading
import time
from collections import Counter

sys.path.insert(0, ".")

import paho.mqtt.client as mqtt  # noqa: E402
from paho.mqtt.enums import CallbackAPIVersion  # noqa: E402

from app.clients.openf1_auth import token_manager  # noqa: E402
from app.core.config import settings  # noqa: E402

BROKER_HOST = "mqtt.openf1.org"
BROKER_PORT = 8883

# paho reason codes we want to name explicitly
_AUTH_REFUSED = {4, 5, 134, 135}    # bad user/pass, not authorised (MQTT 3.1.1 / 5)


def rc_int(reason_code) -> int:
    """paho 2.x hands back a ReasonCode object; 1.x an int."""
    return int(getattr(reason_code, "value", reason_code))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--topic", default="v1/laps")
    ap.add_argument("--seconds", type=float, default=30.0)
    ap.add_argument("--show", type=int, default=3, help="messages to print in full")
    args = ap.parse_args()

    if not token_manager.configured:
        print("FAIL: OPENF1_USERNAME / OPENF1_PASSWORD are not set — MQTT needs the account.")
        return 1
    token = asyncio.run(token_manager.get_token())
    if not token:
        print("FAIL: no access token obtained.")
        return 1
    print(f"token: obtained, {len(token)} chars, expires in {token_manager.seconds_left:.0f}s")

    state: dict = {"rc": None, "suback": False, "messages": 0, "per_topic": Counter(), "shown": 0,
                   "first": None, "last": None, "ids": []}
    done = threading.Event()

    def on_connect(client, userdata, flags, reason_code, properties=None):
        rc = rc_int(reason_code)
        state["rc"] = rc
        print(f"on_connect: reason_code={rc} ({reason_code})")
        if rc == 0:
            client.subscribe(args.topic, qos=1)
        else:
            done.set()

    def on_subscribe(client, userdata, mid, reason_codes, properties=None):
        state["suback"] = True
        print(f"on_subscribe: mid={mid} granted={[rc_int(c) for c in reason_codes]}")

    def on_message(client, userdata, msg):
        now = time.time()
        state["messages"] += 1
        state["per_topic"][msg.topic] += 1
        state["first"] = state["first"] or now
        state["last"] = now
        try:
            payload = json.loads(msg.payload)
        except Exception:
            payload = {"_raw": msg.payload[:120].decode("utf-8", "replace")}
        if isinstance(payload, dict) and "_id" in payload:
            state["ids"].append(payload["_id"])
        if state["shown"] < args.show:
            state["shown"] += 1
            print(f"  msg[{state['messages']}] topic={msg.topic} keys={sorted(payload)[:12] if isinstance(payload, dict) else type(payload).__name__}")
            print(f"    {json.dumps(payload, default=str)[:400]}")

    def on_disconnect(client, userdata, flags, reason_code=None, properties=None):
        print(f"on_disconnect: reason_code={reason_code}")

    client = mqtt.Client(CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv311)
    client.username_pw_set(username=settings.openf1_username or "probe", password=token)
    client.tls_set(cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS_CLIENT)
    client.on_connect, client.on_subscribe = on_connect, on_subscribe
    client.on_message, client.on_disconnect = on_message, on_disconnect

    print(f"connecting to {BROKER_HOST}:{BROKER_PORT} (TLS), topic={args.topic!r}, window={args.seconds:.0f}s")
    t0 = time.time()
    try:
        client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
    except Exception as exc:
        print(f"FAIL: connect() raised {type(exc).__name__}: {exc}")
        return 2
    client.loop_start()
    done.wait(timeout=args.seconds)
    if state["rc"] == 0:
        time.sleep(max(0.0, args.seconds - (time.time() - t0)))
    client.loop_stop()
    client.disconnect()

    print()
    print(f"connect reason_code : {state['rc']}")
    print(f"subscribe ack       : {state['suback']}")
    print(f"messages received   : {state['messages']}")
    for t, n in state["per_topic"].most_common():
        print(f"  {t}: {n}")
    if state["ids"]:
        print(f"_id range           : {min(state['ids'])} … {max(state['ids'])} ({len(set(state['ids']))} distinct)")
    if state["first"]:
        print(f"traffic window      : {state['last'] - state['first']:.1f}s")

    if state["rc"] == 0:
        print("\nRESULT: authenticated and subscribed." + ("" if state["messages"] else " No traffic — no live session right now."))
        return 0
    if state["rc"] in _AUTH_REFUSED:
        print("\nRESULT: broker refused the credentials.")
        return 1
    print("\nRESULT: could not establish a usable connection.")
    return 2


if __name__ == "__main__":
    sys.exit(main())
