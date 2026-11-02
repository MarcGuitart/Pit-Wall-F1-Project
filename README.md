<div align="center">

# Pit Wall Engineer

### Watch F1 like an engineer, not like a spectator.

**[pitwallengineer.com](https://pitwallengineer.com)** · **[Docs: free, PRO and live mode](https://pitwallengineer.com/docs)** · [Leer en español](README.es.md)

![Python](https://img.shields.io/badge/Python-3.11-3776AB)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688)
![Next.js](https://img.shields.io/badge/Next.js-14-000000)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)
![Data](https://img.shields.io/badge/Data-OpenF1-555555)

</div>

---

## What it is

Pit Wall Engineer turns raw Formula 1 timing data into the analysis a race engineer would run: true pace, tyre degradation, pit impact, race phases, weather crossovers and telemetry replay.

During a session, Live mode puts the same lens on the feed as it arrives: timing and sectors, track map, car data, tyres, race control and team radio.

Every number carries its confidence and the size of the sample behind it. A reading that cannot be judged yet is labelled as such, never rounded into certainty.

<p align="center">
  <img src="docs/img/readme-analysis.png" alt="Race analysis: strategy view" width="100%" />
</p>

---

## Product principle: confidence and sample size

A ranking built on four laps is not a ranking built on forty. The product treats that as a design rule, not a footnote.

- Pace results show how many clean laps they rest on and carry a confidence level derived from that count.
- Excluded laps are logged with the reason, so every ranking can be audited.
- Weather crossovers that overlap a safety car are flagged and downgraded, not credited to tyre choice alone.
- In Live mode, anything that only exists at the chequered flag, such as the final Chaos Index, stays empty until then.
- Pit window signals are measurements with a confidence and a stated basis, never a predicted stop lap.

---

## Modules and the question each one answers

| Module | Strategic question |
|---|---|
| **True Pace** | Who was actually fast once pit laps, safety car laps and outliers are removed? |
| **Tyre degradation** | Where did each stint start to fall off, and how steep was it? |
| **Pit impact** | Did the stop gain or lose positions, and was the undercut real? |
| **Race phases** | What was the race doing on each lap: sorting, pit window, safety car reset, final push? |
| **Chaos Index** | How disordered was the race, and on which lap did it peak? |
| **DRS trains** | When were cars stuck in a group, and for how long? |
| **Weather crossovers** | Who was early, on time or late when the track changed? |
| **Clean air value** | What was running free worth against running in traffic? |
| **Telemetry replay** | How did the drivers differ through speed, throttle, brake and gear on one lap? |
| **Race control and radio** | What did the stewards and the pit wall say, and when? |
| **AI race engineer** | What does this specific race say about a question I have? |

Live mode adds a session view with eight tabs: **Timing**, **Track and car**, **Strategy**, **Predictions** (only when the live server sends a projection), **Race control and radio**, **Lap charts**, **Engineer AI** and **Feed**. Practice and qualifying sessions get their own profile: best laps, sector colours, long runs and session status.

<p align="center">
  <img src="docs/img/readme-live.png" alt="Live mode: timing, track map and car data" width="100%" />
</p>

---

## Screenshots

Captured from a published historical race by [`scripts/readme_shots.py`](scripts/readme_shots.py).

| | |
|---|---|
| ![Analysis](docs/img/readme-analysis.png) | ![Live](docs/img/readme-live.png) |
| Race analysis | Live mode |
| ![Telemetry](docs/img/readme-telemetry.png) | ![Chaos](docs/img/readme-chaos.png) |
| Telemetry replay | Chaos Index and race phases |

---

## Architecture

```
OpenF1 (REST + MQTT)
  |
  |-- Analysis API (FastAPI, Render)
  |     async OpenF1 client (httpx, semaphore, retry)
  |     per-session JSON cache, immutable for past races
  |     RaceTimeline (one canonical object shared by every service)
  |     services: pace, tyre, pit, chaos, drs, weather, crossover,
  |               race phase, clean air, decisions, notes, DNA
  |     FastF1 telemetry, precomputed and served from cache
  |     AI chat: Ollama locally, Groq in production
  |
  |-- Recorder (Render, persistent disk)
  |     holds the MQTT subscription, writes the capture,
  |     archives finished captures to Cloudflare R2
  |
  |-- Live server (Render)
  |     second MQTT subscription, one snapshot, SSE to browsers
  |
Frontend (Next.js 14 on Netlify)
      historical analysis, Live mode, docs, access settings
```

- **Frontend:** Next.js 14 (App Router), TypeScript strict, Tailwind, Framer Motion, Zustand, Recharts. Deployed on Netlify.
- **Backend:** FastAPI, Pydantic v2, Polars, NumPy, httpx. Deployed on Render.
- **Source:** OpenF1 for laps, stints, pit stops, position, intervals, race control, weather, drivers and the live MQTT feed. FastF1 for circuit telemetry.
- **Cloudflare R2:** S3-compatible storage where the recorder archives finished live captures.
- **Why the recorder and the live server are separate:** a bug in the viewer must never stop the recording, and OpenF1 MQTT has no replay. See [docs/live-infrastructure.md](docs/live-infrastructure.md) and [docs/live-deployment.md](docs/live-deployment.md).
- **Publication:** a GitHub Action publishes each finished race into `backend/cache/` and a daily job precomputes telemetry. A commit to `main` is a deploy, which is why the Render blueprint uses build filters. See [docs/DEPLOY.md](docs/DEPLOY.md).

---

## Plans

| | Seasons | Includes |
|---|---|---|
| **Free** | 2023 and 2024 | Full analysis, every session type, no account |
| **PRO** | 2025 onwards and the current season | The above plus Live mode, EUR 2.99 per month once subscriptions open |

Subscriptions are not open yet. PRO is available with an access code, entered once in Settings. The gate lives on the backend: the browser only holds a signed token. Details at [pitwallengineer.com/docs](https://pitwallengineer.com/docs).

---

## Run it locally

Requirements: Python 3.11, Node.js 18 or later. Ollama with `llama3.1:8b` is optional and only used by the AI chat.

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload    # http://localhost:8000
```

```bash
# Frontend
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                      # http://localhost:3000
```

Tests:

```bash
cd backend && pip install -r requirements-dev.txt && pytest
cd frontend && npm test
```

### Live mode against a recording

```bash
cd backend
pip install -r requirements-live.txt
python scripts/live_server.py --replay 9636 --replay-speed 0.02
# or replay a capture recorded by the recorder:
python scripts/live_server.py --replay-capture <capture dir> --speed 60

cd ../frontend
NEXT_PUBLIC_LIVE_URL=http://localhost:8099 npm run dev
```

### Telemetry for another session

```bash
cd backend
python scripts/precompute_telemetry.py --sessions <session_key> --drivers VER,NOR,LEC,PIA,RUS
```

---

## Environment variables

Names only. Real values belong in the host dashboards, never in the repo. Templates: `backend/.env.example` and `frontend/.env.local.example`.

**Backend**

| Variable | Purpose |
|---|---|
| `OPENF1_BASE_URL` | OpenF1 REST base URL |
| `OPENF1_USERNAME`, `OPENF1_PASSWORD` | OpenF1 account, exchanged for a renewing bearer token |
| `OPENF1_API_TOKEN` | Legacy static token, ignored when username and password are set |
| `CACHE_DIR` | Where per-session JSON is stored |
| `CORS_ORIGINS` | Allowed browser origins |
| `ENVIRONMENT` | `development` or `production` |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Local AI chat |
| `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_REASONING_EFFORT` | Production AI chat |
| `FREE_SEASONS` | Seasons open to everyone |
| `PRO_ACCESS_CODES`, `PRO_TOKEN_SECRET`, `PRO_TOKEN_TTL_DAYS` | PRO gate |
| `INTERNAL_BUILD_SECRET` | Lets the publication Action compute PRO seasons |

**Recorder and live server**

| Variable | Purpose |
|---|---|
| `CAPTURE_BUCKET`, `CAPTURE_ENDPOINT_URL`, `CAPTURE_REGION` | S3-compatible archive (Cloudflare R2) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Credentials for that bucket |
| `LIVE_ALLOWED_ORIGINS` | Origins allowed to open the live stream |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Operational notifications |

**Frontend**

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Analysis API |
| `NEXT_PUBLIC_LIVE_URL` | Live server |
| `NEXT_PUBLIC_PW_BUILD` | Build label |

---

## Data and attribution

Session data comes from [OpenF1](https://openf1.org) and circuit telemetry from FastF1. Historical data starts in 2023. Team radio clips are linked from the official archive and are never copied or stored here.

## License

MIT, see [LICENSE](LICENSE).

**Unofficial project. Not affiliated with Formula 1, the FIA or any team.** F1, FORMULA 1 and related marks are trademarks of Formula One Licensing B.V.
