# Deploying the live feed — the plan, the rehearsal, the cost

Nothing here has been deployed. The blueprint is `backend/render.yaml`; this is
what it costs, what to put in it, and how to find out whether it works before it
has to.

Prices checked 27 September 2026.

---

## The deadline

The next Grand Prix is **Kuala Lumpur**, and it is **not** a sprint weekend.

| Session | session_key | Start (UTC) | Local (UTC+8) |
|---|---|---|---|
| Practice 1 | 11727 | **Fri 2 Oct, 04:30** | 12:30 |
| Practice 2 | 11728 | Fri 2 Oct, 08:00 | 16:00 |
| Practice 3 | 11729 | Sat 3 Oct, 04:30 | 12:30 |
| Qualifying | 11730 | Sat 3 Oct, 08:00 | 16:00 |
| Race | 11731 | **Sun 4 Oct, 07:00** | 15:00 |

The race is the deliverable, but **FP1 is the deadline**: it is the first live
session and the only one that leaves two more practice sessions and a qualifying
to fix things in. From 27 September that is **4 days and 12 hours**.

(OpenF1's `country_name` for this meeting reads "Bahrain", which is wrong;
`location` and `circuit_short_name` both say Kuala Lumpur. Harmless, but do not
be alarmed by it in a payload.)

---

## Monthly cost

| | | |
|---|---|---|
| Recorder — Render Starter, 0.5 CPU / 512 MB | $7.00 | web service, for the health check |
| Recorder disk — 5 GB @ $0.25/GB | $1.25 | survives deploys and restarts |
| Live server — Render Starter | $7.00 | no disk |
| Capture archive — Cloudflare R2 | $0.00 | 10 GB free; a season is well under 1 GB |
| **Total** | **$15.25/month** | |

The analysis API stays on the free tier and is unchanged.

**$183/year.** Two notes on the shape of it rather than the number:

- The disk is the cheapest line and the one that matters most. Without it a
  deploy during a session destroys the capture to that point, and OpenF1 has no
  replay to recover it from.
- R2 is $0.00 because 10 GB is free and Baku's race was 25 MB. Beyond the free
  tier it is $0.015/GB-month with **free egress**, so a season that grows to
  2 GB costs $0.03 a month. Backblaze B2 is cheaper per GB ($0.00695) and also
  has 10 GB free, but meters egress above 3× stored; at this size neither
  difference is real, and R2's free egress removes the only line that could ever
  surprise. The upload is written against the S3 API, so moving between R2, B2
  and S3 is an endpoint change and nothing else.

---

## Environment variables

Set in the Render dashboard. None belong in the repo.

### pit-wall-recorder

| Variable | Value |
|---|---|
| `OPENF1_USERNAME` / `OPENF1_PASSWORD` | the paid OpenF1 account |
| `CAPTURE_BUCKET` | the R2 bucket name |
| `CAPTURE_ENDPOINT_URL` | `https://<account_id>.r2.cloudflarestorage.com` |
| `CAPTURE_REGION` | `auto` (set in the blueprint) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | the R2 API token |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | the bot the publication Action already uses |
| `PORT` | supplied by Render; the health endpoint binds it |

### pit-wall-live

| Variable | Value |
|---|---|
| `OPENF1_USERNAME` / `OPENF1_PASSWORD` | the same account, a second subscription |
| `PRO_TOKEN_SECRET` | **identical to the API's** |
| `PRO_ACCESS_CODES` | **identical to the API's** |
| `LIVE_ALLOWED_ORIGINS` | `https://pitwallengineer.com` |

`PRO_TOKEN_SECRET` and `PRO_ACCESS_CODES` must match the API exactly. A
different secret refuses every token the API mints; a different code list
silently un-revokes a code the API has revoked.

Both accept a bare value, a comma-separated list or a JSON array. They did not
until today: a list-typed setting was JSON-decoded before its validator ran, so
`PRO_ACCESS_CODES=MYCODE` raised `SettingsError` at import and the service never
started. Typing a code into a dashboard is the likeliest way that variable is
ever set.

### frontend (Netlify)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_LIVE_URL` | `https://pit-wall-live.onrender.com` |

No trailing slash. It is read at build time, so changing it needs a rebuild.

---

## Dress rehearsal — FP1, Friday 2 October, 04:30 UTC

The point is not to watch a practice session. It is to find out which of the
things that only happen in production are broken, while three more sessions
remain to fix them in.

### The day before: deploy and prove it is running

Deploy on **Thursday 1 October**, not Friday. A deploy restarts the recorder,
and doing that on the morning of the session removes the margin the rehearsal
exists to create.

1. Create the R2 bucket and its API token. Set every variable above.
2. Deploy all three services from the blueprint.
3. `curl https://pit-wall-recorder.onrender.com/health` →
   `"broker": "connected"`, `"subscribed_topics": 10`. **This is the check that
   matters most.** A process that is alive and subscribed to nothing looks
   identical from outside to one recording a quiet session; this endpoint is the
   only thing that tells them apart.
4. `curl https://pit-wall-live.onrender.com/health` → `"ok": true`.
5. `curl https://pit-wall-live.onrender.com/live/11727/snapshot` → **402
   PRO_REQUIRED**. If it returns 200, the gate is open and the deploy is wrong.
6. Redeem a code in the browser, open `/live/11727`. Expect the empty-but-honest
   page: no tower, no chaos, "waiting for the first snapshot". An empty page here
   is the correct answer — nothing is running.
7. Push a whitespace change to `README.md` and confirm **neither live service
   redeploys**. That is the build filter, and it is the mechanism standing
   between the hourly publication commit and a dropped subscription mid-race.

### T−60 minutes (03:30 UTC)

8. `/health` on both, again. Render may have restarted something overnight.
9. Note `"messages"` on the recorder. It should be low and static — the feed is
   quiet before a session.

### T−15 minutes (04:15 UTC)

10. Open `/live/11727` and leave it open. Open the recorder's `/status` in
    another tab.
11. When the feed starts, `"messages"` climbs and the recorder's `ROLL` line
    appears in the Render log: `recording session 11727 into /var/captures/11727`.
    A Telegram message says recording started. **If no roll happens, the
    recorder is receiving nothing** — go to "if it fails" below.

### During the session — in this order

Check these in order of how expensive they are to discover late.

12. **Is anything being recorded?** `/status` → `messages` rising, `write_errors`
    0. Nothing else matters if this is wrong.
13. **Does the tower populate?** Drivers, positions, gaps, lap times. Compare two
    or three against any live timing screen. They will not match to the
    millisecond — intervals are ~4 s resolution — but the order must match.
14. **Does the page survive a token renewal?** Both services renew about 53
    minutes in. FP1 is only an hour, so this may not fire; FP2 will. The live
    page should show at most one stale frame.
15. **Is the stream compressed?** DevTools → Network → the stream request →
    `content-encoding: gzip`. It is 7.5× on the wire and easy to lose to a proxy.
16. **Does a reconnect recover?** Kill the browser tab's network for 30 seconds
    (DevTools offline, then online). The banner should say the connection is
    lost, then reconnect on its own with backoff.
17. **Does chaos refuse to show a level?** It must read "no level until the
    flag". FP1 has no chequered flag in the race sense, so it should never show
    Low/Medium/High/Extreme.

### After the session

18. The recorder does **not** archive FP1 at the flag — practice has no chequered
    flag — but it will archive when it rolls to FP2's session_key. Confirm a
    Telegram message and the object in R2.
19. Download it and replay it locally. This is the real proof:
    ```
    aws s3 cp s3://<bucket>/captures/11727.tar.gz . --endpoint-url <r2 endpoint>
    tar xzf 11727.tar.gz -C backend/live/
    python scripts/live_state.py --replay-capture backend/live/11727 --speed 0
    ```
    If that replays, the capture is complete and the whole chain worked.

### If something fails

| Symptom | Likely cause | Do this |
|---|---|---|
| `/health` 503, `broker: disconnected` | credentials, or OpenF1 is down | Check the Render log for `TOKEN`/`CONNECT`. Render restarts it at 180 s on its own; do not restart it by hand first. |
| Recorder healthy, `messages` flat during the session | subscribed but no traffic | Compare with the live server — if that one is receiving, the recorder's subscription is the problem; redeploy it. If neither is, OpenF1 is not publishing. |
| `/live/...` returns 402 with a valid code | `PRO_TOKEN_SECRET` differs between API and live | Copy the API's value exactly. A token is minted by one and verified by the other. |
| Page loads, tower empty, banner green | the live server is on another session | `/health` reports `session_key`. It follows whatever the feed sends; if it is wrong, the feed is. |
| Frames stop, banner stays green | the server lost the broker, not the browser | `feed.stale` goes true after 25 s and the banner turns amber. If it does not, that is a bug worth catching now. |
| Archive never appears | R2 credentials or bucket name | `/status` → `archive_error` has the exception. The capture is still on the disk; nothing is lost. |

**The abort condition.** If the recorder cannot hold the broker through FP1 and
FP2, do not run the race on it. The laptop recorder worked for Baku and is a
known quantity; falling back to it costs nothing but the deploy. The live server
failing is survivable — it is a view, and the page can stay dark.

---

## What is deliberately not automated

The recorder records **every** session it sees, including practice and
qualifying, because deciding when to be connected is the thing that cannot be
retried — a scheduler that fails on a Sunday morning costs a race with no second
chance. A disk holding a season of everything is $1.25/month. The schedule is
not worth the risk it would add.
