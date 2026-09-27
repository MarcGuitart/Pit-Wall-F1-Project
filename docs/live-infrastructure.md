# Running the live feed in production

Research only. Nothing here has been deployed.

Prices checked 27 September 2026; every one of them is a list price that will
drift, so the comparison is written to survive the numbers changing.

---

## What actually has to run

One process, `scripts/live_server.py`, that:

1. **holds a TLS MQTT subscription** to `mqtt.openf1.org:8883` for the length of
   a session — about 3 h 10 m for a race once you count the pit-lane open, the
   formation lap and the post-race classification;
2. **swaps its credentials mid-session.** The OpenF1 token lives 3600 s, so a
   race needs at least one renewal, and a renewal is a disconnect and reconnect
   with a new password. The Baku recording did five, each a sub-second gap;
3. **is already connected before the session starts.** This is the constraint
   that eliminates most of the cheap options. OpenF1's MQTT topics have no
   replay and no retained history: a subscriber that attaches at lights-out has
   simply lost the grid, the formation lap and the opening order. There is no
   catching up afterwards;
4. **fans a snapshot out to browsers**, currently one SSE stream per viewer.

It runs on roughly 24 race weekends a year. A weekend is three or four
sessions, so call it 24 × 12 h ≈ 290 h of genuinely needed uptime against 8 760
h in the year. That ratio is the whole cost argument, and point 3 is why it is
harder to exploit than it looks.

### Load, measured

From the Baku replay, at the end of the race:

| | |
|---|---|
| Snapshot size | 26.1 KB JSON, 4.5 KB gzipped |
| Push interval | 2 s |
| Per viewer | ~13 KB/s uncompressed, ~2.3 KB/s gzipped |
| Per viewer, 2 h race | ~94 MB uncompressed, ~16 MB gzipped |
| Ingest | 34,075 messages over 3 h 5 m — about 3/s |
| Full analysis pass | 0.07–0.13 s |
| Resident set | well under 200 MB with the whole race in memory |

The analysis is cheap and the ingest is trivial. **This is a bandwidth and
connection-count problem, not a CPU problem**, which matters for the choice
below: the smallest instance every provider sells is fast enough.

---

## Why the free Render tier cannot do it

Three independent reasons, each sufficient on its own:

1. **Background workers have no free instance type.** Render's free tier covers
   web services, static sites, Postgres and Key Value only. The service type
   built for "runs continuously, receives no inbound traffic" — which is exactly
   an MQTT subscriber — starts at the paid tier.
2. **A free web service spins down after 15 minutes without _inbound_ traffic,**
   and takes about a minute to come back. An outbound MQTT socket is not inbound
   traffic. So the process is reaped during the quiet hour before lights-out —
   precisely the hour in which it has to be connected — and the wake-up is
   triggered by a viewer's request, a minute after the viewer wanted it.
3. **750 instance-hours per workspace per month.** A single always-on service is
   ~730 h. Running the live server around the clock would consume the entire
   workspace allowance and suspend the existing analysis API with it.

Beyond the documented limits: free services restart on every deploy and carry no
uptime commitment, and a restart mid-race is an unrecoverable data loss for the
reason in point 3 above.

---

## The three candidates

### A. Render, paid — $7/month

The Starter instance (0.5 CPU, 512 MB) is the entry paid tier and applies to both
web services and background workers. Two shapes:

**A1 — a second web service.** It serves HTTP, so it holds the SSE streams
itself; no extra moving parts. One new service beside the existing backend, the
same dashboard, the same secret store, the same deploy pipeline. $7/mo, $84/yr.

**A2 — a background worker plus the existing web service.** A worker receives no
inbound traffic and therefore cannot serve SSE at all, so the snapshot has to
travel worker → Render Key Value → web service → browser. Two paid services and
a Key Value instance to do what A1 does with one. It buys one real thing —
deploying the analysis API no longer drops the MQTT subscription — and at this
size that is not worth three components.

Watch for: Render's proxy closes an idle response, so the SSE keep-alive matters.
`live_server.py` already writes a comment frame every 15 s.

### B. Fly.io — $1.94–$3.89/month always-on, or cents if scheduled

`shared-cpu-1x` at 256 MB is $1.94/mo, and 512 MB on `shared-cpu-2x` is $3.89/mo.
Billing is per second while the machine runs, which is the interesting part: at
290 needed hours a year, always-on is ~$23/yr and *scheduled* is under $1/yr of
compute.

The catch is how you schedule it. Fly's auto-stop/auto-start is driven by inbound
requests — the same wrong trigger that breaks Render's free tier, for the same
reason. To use the cheap path you drive `fly machine start` from the session
calendar, which the project can already read from OpenF1 `/sessions`. That is a
cron job whose failure mode is missing a race with no second chance.

Egress is $0.02/GB in Europe and North America, free inbound. At 94 MB per viewer
per race, 100 viewers is ~9.4 GB, about $0.19 a race — and roughly nothing if the
stream is gzipped.

Cost: a Dockerfile, a `fly.toml`, a second set of secrets, a second place to read
logs, and a scheduler you have to trust.

### C. A VPS — €5.49/month (Hetzner CPX11) or $6/month (DigitalOcean)

Hetzner's CPX11 is 2 vCPU / 2 GB / 40 GB with a 20 TB traffic allowance at EU
locations; the equivalent DigitalOcean droplet is around $24/mo for 2 vCPU/4 GB,
or $6 for the 1 GB basic. Note that Hetzner's cost-optimised shared plans were
unavailable as of September 2026 and prices rose in April, so confirm before
committing.

No spin-down, no platform-initiated restarts, bandwidth that makes the fan-out
question disappear, and root on the box. In exchange you own OS updates, a TLS
certificate, a systemd unit, log rotation, a firewall and monitoring — recurring
work for one long-lived process.

There is a second argument for this one that has nothing to do with the live
server. **The recorder is the system of record and it currently runs on a
laptop.** The Baku capture ends with the recorder failing at 13:18 with
`nodename nor servname provided` — a DNS failure, i.e. the laptop's network went
away — and retrying eleven times against a name it could no longer resolve. A
VPS fixes that problem, and the live server is then a second process on a box you
are already paying for.

---

## Comparison

| | Render Starter (A1) | Fly.io | VPS |
|---|---|---|---|
| List price | $7/mo · $84/yr | $1.94–3.89/mo always-on; ~$1/yr scheduled | €5.49/mo · ~€66/yr |
| Spin-down risk | none | none if always-on; scheduler risk if not | none |
| Connected before lights-out | automatic | automatic if always-on; depends on cron if not | automatic |
| Reconnect after a drop | app's own retry | app's own retry | app's own retry |
| Restarts you don't control | on deploy | machine migrations | none |
| Serves SSE directly | yes | yes | yes |
| Bandwidth | included | $0.02/GB egress | 20 TB included (Hetzner EU) |
| New operational surface | none — same platform | Dockerfile, fly.toml, secrets, scheduler | the whole OS |
| Also solves the recorder | no | partly | yes |

---

## How the stream reaches users

Independent of the host, and worth more than the hosting choice.

1. **Today: one SSE stream per viewer from a `ThreadingHTTPServer`** — one OS
   thread per connection. On 512 MB, thread stacks alone put the ceiling in the
   low hundreds, and each of those threads wakes every 2 s to write 26 KB.
2. **Move the live endpoint into the existing FastAPI/uvicorn app as an async
   SSE endpoint.** Thousands of idle connections on one core, no thread apiece.
   This is the single highest-value change here and it costs nothing. It does
   couple the live subscription to the API's deploys — the reason the live server
   was built as a separate process in the first place — so the honest version is
   an async server in its *own* uvicorn process, not a merge into `app.main`.
3. **Send deltas, not snapshots.** Every push is currently the whole state.
   `RaceState.ingest` already returns a description of what changed and is not
   using it; the tower and the radio list are 12 KB of the 26 KB and mostly do
   not move between frames.
4. **Enable gzip on the SSE response.** 26 KB → 4.5 KB measured, for one header
   and a compressor. Nothing else on this list is as cheap.
5. **Only if you outgrow one box:** publish once into a fan-out service
   (Cloudflare Durable Objects, Ably, Pusher) and let it hold the connections.
   Not needed at any plausible audience for this project, and it moves per-viewer
   cost from "free" to "metered".

---

## Recommendation

**Render Starter, a second web service, always on — option A1 — and do items 2
and 4 of the fan-out list before the next race.**

The reasoning is not about the $7. It is that this system's entire value is being
connected at a specific moment that happens 24 times a year and never repeats.
Fly's scheduled machine is genuinely cheaper — call it $80 a year saved — but it
pays for that by adding a cron job to the critical path, and a cron job that
fails silently on a Sunday morning costs a race that cannot be re-recorded. An
always-on Fly machine removes that risk and still saves $60, but it buys a second
platform, a second toolchain and a second place to look when something breaks, for
a project that already deploys to Render without ceremony.

So: pay the $84 to keep the number of things that can fail at one.

**Two caveats on that recommendation.**

The first is that it is contingent on the recorder staying where it is. If the
laptop-hosted recorder moves to a server — and the DNS failure at the end of the
Baku capture is a decent argument that it should — then the VPS becomes the right
answer for both, and the live server rides along at no extra cost. The decision to
make first is about the recorder, not the live server.

The second is that A1 leaves the mid-race deploy hazard in place: pushing to the
live service during a session drops the MQTT subscription. The mitigation is a
rule, not a mechanism — do not deploy the live service on a race day — and a rule
is weaker than option A2's separation. Accept it knowingly, or take A2 and pay $14
plus a Key Value instance for the mechanism.
