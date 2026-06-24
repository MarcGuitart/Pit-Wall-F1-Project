<div align="center">

# Pit Wall IQ

### Watch F1 like an engineer, not like a spectator.

An unofficial post-race strategy intelligence dashboard that turns raw OpenF1 timing, race-control, weather, pit, interval, and car input data into race interpretation you can actually use: true pace, tyre cliff risk, pit impact, DRS trains, weather crossovers, chaos, full-race driver inputs, and a local AI race engineer.

Every module answers a strategic question. No raw data dumps.

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-custom--tokens-38BDF8?logo=tailwindcss&logoColor=white)
![Ollama](https://img.shields.io/badge/AI-Ollama%20%2B%20llama3.1%3A8b-black)
![Data](https://img.shields.io/badge/Data-OpenF1-E10600)
![Telemetry](https://img.shields.io/badge/Telemetry-throttle%20%7C%20brake%20%7C%20speed%20%7C%20gear-7C3AED)

**Strategy intelligence** · **Full-race driver inputs** · **Local race engineer**

</div>

---

## What it does

A Formula 1 race analysis tool with two views:

**Strategy View** (default) — curated panels that answer the race's central strategic question in under 30 seconds. Designed for someone who watched the race but wants to understand *why* the finishing order is what it is.

**Data View** — complete analytical tables: every driver's clean lap samples and exclusion log, per-stint degradation slopes, each pit stop with position delta and verdict, and full engineer signals.

**Circuit Telemetry / Driver Inputs** — choose one or more drivers and inspect speed, throttle, brake, gear, DRS, lap number, and race-time traces across the full race. The panel uses FastF1 when local circuit telemetry is available and falls back to OpenF1 `car_data` for full-race input traces.

The Race Wall Engineer chat uses a local Ollama LLM with a compact (~1000-token) session context injected as the system prompt. It answers questions about that specific race, not F1 in general.

---

## Analysis modules

### True Pace Ranking
Filters to clean laps — excludes pit in/out laps, SC/VSC neutralisation periods, and statistical outliers (>2.5× IQR). Reports median clean pace per driver with an exclusion log explaining why the ranking diverges from broadcast pace. Confidence levels: Low / Medium / High based on sample size.

### Tyre Cliff Map
Per-stint linear regression slope (s/lap) fitted to clean lap times. Classifies degradation as High cliff (≥0.08 s/lap), Medium, or Stable. Groups drivers by risk level and highlights which compound had the lowest average slope.

### Pit Stop Impact
Position delta = position at `pit_lap − 1` vs `pit_lap + 3`, reconstructed from timestamp-interpolated OpenF1 position data (not lap-number-based). Verdict labels: SC Winner, Undercut, Gained, Neutral, Costly, Lost.

### Race Phase Timeline
Classifies each lap range into a named phase — Safety Car Reset, VSC Period, Weather Crossover, DRS Train Compression, Pit Window, Start/Sorting, Degradation Phase, Final Push, Racing. Phases are priority-resolved when they overlap (SC beats Weather, Weather beats DRS, DRS beats Degradation).

### Race DNA Card
Eight-point strategic fingerprint: primary factor, secondary factor, strategy type, overtaking difficulty, pit timing sensitivity, tyre degradation impact, chaos level. Fully deterministic — no LLM involvement.

### DRS Train Aggregation
Converts raw 4-second interval snapshots into sustained meaningful trains by merging consecutive windows with ≥50% driver overlap. SC/VSC laps are filtered before merging. For Brazil 2024: 68 raw windows → 7 meaningful trains.

### Weather Crossover Windows
Detects DRY → DAMP → WET transitions and classifies drivers as best-timed, late, or early based on pit timing relative to the window. **Attribution guard**: if a safety car was active during the window, the summary explicitly states that position changes cannot be attributed to tyre choice alone — protecting against false attribution.

### Chaos Index
Score 0–100 from a weighted sum: SC events (×15, cap 30), yellow flags (×3, cap 20), investigations (×5, cap 20), time penalties (×4, cap 15), rain periods (×10, cap 15), position volatility (÷5, cap 20). Peak chaos lap detection included.

### Circuit Telemetry (FastF1 Replay)
Powered by `GET /telemetry/{session_key}?drivers=VER,NOR,HAM`. Located in its own **Telemetry tab** in the analysis view.

- **Replay mode** — animated car dot moves along the circuit outline in sync with Speed / Throttle / Brake / Gear / DRS channel panels. Playback speeds: 0.5× / 1× / 2× / 4×. Scrub bar seeks to any lap position.
- **Metric heatmap** — circuit outline coloured per-segment: Speed (red→amber→green), Throttle (blue→green), Brake zones (red only), Gear (purple/blue/green/amber by pair). Switches in real time when metric selector is changed.
- **Multi-driver comparison** — up to 3 drivers simultaneously, each in team colour, line weight proportional to speed. Car dots for all selected drivers animated together.
- **Sector time comparison** — S1 / S2 / S3 cards below the channels show best time per sector and delta to second driver.
- **Hover sync** — moving the cursor over the circuit map moves the cursor line in all 5 channel panels simultaneously, and vice versa.
- FastF1 data cached at `cache/{session_key}/telemetry.json` — first load 5–15 seconds, subsequent loads instant.

### Race Wall Engineer
RadioOverlay with F1 team radio UX: animated waveform on open, synthetic radio sounds via Web Audio API, grounded answers via Ollama. Context passed to the model is a compact JSON summary of the race — top-3 pace, tyre cliffs, pit winners/losers, key decisions, race DNA, phase summary, DRS peak train. Dynamic suggested questions are generated from the session data (weather impact, DRS train presence, focused driver, chaos score). Alternate implementation using Anthropic Claude API is available at `frontend/app/api/engineer-chat/route.ts`.

---

## Architecture

```
OpenF1 REST API
    │
    ▼
httpx AsyncClient
  · Semaphore(2) — max concurrent fetches
  · Jitter 0.2–0.6s between requests
  · 429 retry with Retry-After header, 4 attempts max
  · Per-endpoint file cache (immutable for historical sessions)
    │
    ▼
RaceTimeline  ←── built ONCE per session from all raw data
  · Canonical per-lap signal object (SC/VSC active, weather
    condition, pits this lap, min gap, leader, clean laps)
  · All services read from this — no repeated timestamp resolution
    │
    ├── pace_service      → TruePaceRow[]
    ├── tyre_service      → TyreDegradationRow[]
    ├── pit_service       → PitImpactRow[]
    ├── chaos_service     → ChaosIndex
    ├── weather_service   → WeatherAnalysis
    ├── drs_service       → DRSAnalysisAggregated
    ├── crossover_service → CrossoverWindow[], WeatherWinnersLosers
    ├── race_phase_service→ RacePhase[]
    ├── race_dna_service  → RaceDNA
    ├── clean_air_service → CleanAirValue
    ├── telemetry_service → DriverTelemetry[] (FastF1 or OpenF1 car_data)
    ├── notes_service     → EngineerNote[]
    └── decisions_service → RaceDecision[]
         │
         ▼
    FullRaceAnalysis (Pydantic v2)
    cached as _analysis.json per session — repeat loads are instant
         │
         ▼
    Next.js 14 frontend
    · Zustand global store (analysis, focused driver, view mode)
    · Single hook (useRaceAnalysis) owns all fetching — in-flight
      deduplication, single-flight backend lock prevent duplicates
    · Lazy telemetry panel fetches only the selected drivers
```

The `RaceTimeline` object is the central V4 architectural decision. Before it existed, each service resolved OpenF1 timestamps independently. Now they share a single canonical per-lap signal map, which makes the services testable in isolation and eliminates drift.

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- [Ollama](https://ollama.ai) for AI chat (optional — app runs without it)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # edit if needed
uvicorn app.main:app --reload
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local    # set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
# → http://localhost:3000
```

### AI chat (Ollama)

```bash
ollama serve
ollama pull llama3.1:8b       # ~4.7 GB

# Lighter alternatives: phi3:mini, mistral:7b
# Set OLLAMA_MODEL in backend/.env to use a different model
```

The app works without Ollama — the Radio Overlay shows an offline state with setup instructions.

### Environment variables

**`backend/.env`**

| Variable | Purpose |
|----------|---------|
| `OPENF1_BASE_URL` | OpenF1 API endpoint (default: `https://api.openf1.org/v1`) |
| `CACHE_DIR` | Directory for per-session JSON cache files (default: `./cache`) |
| `OLLAMA_BASE_URL` | Ollama server address (default: `http://127.0.0.1:11434`) |
| `OLLAMA_MODEL` | Model to use for the race engineer (default: `llama3.1:8b`) |

**`frontend/.env.local`**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Backend URL the frontend calls |
| `ANTHROPIC_API_KEY` | Optional — only needed if using the Claude API chat route |

---

## Demo sessions

| Race | Year | session_key | Why it's useful for testing |
|------|------|-------------|----------------------------|
| Brazilian GP | 2024 | `9636` | Extreme chaos (100/100), rain + SC×2 + VSC, all V4 modules active |
| Spanish GP | 2024 | `9539` | Clean strategic race, undercut sequence, DRS trains, no weather |
| Hungarian GP | 2024 | `9566` | High tyre degradation, cliff map showcase |
| US GP (Austin) | 2024 | `9617` | Earliest session with `stop_duration` field in pit data |

First load fetches from OpenF1 and caches per-endpoint. Subsequent loads return from `_analysis.json` in milliseconds. To force a recompute: `POST /admin/clear-cache/{session_key}`.

Telemetry is loaded lazily after opening the Circuit Telemetry panel. OpenF1 `car_data` is cached per driver and telemetry responses are cached per driver combination, so the first selected driver can take a few seconds and later selections are much faster.

### Validated reference values

| | Brazil 2024 | Spain 2024 |
|-|-------------|------------|
| Chaos | 100 / Extreme | 62 / High |
| Primary factor | Weather + Safety Car | Track Position / DRS |
| Race phases | 10 | 4 |
| Crossover windows | 3 (all with concurrent SC) | 2 (no SC) |
| Meaningful DRS trains | 7 (from 68 raw, 16 SC-filtered) | 3 (from 24 raw) |
| Clean air value | 1.06 s/lap, Medium confidence | 1.33 s/lap, Medium confidence |

---

## API endpoints

```
GET  /health                            → {"status": "ok"}
GET  /races?year=2024                   → list[RaceMeta]
GET  /races/{meeting_key}/sessions      → list[SessionInfo]
GET  /analysis/{session_key}            → FullRaceAnalysis
GET  /analysis/{session_key}?force_refresh=true  → recomputes, bypasses cache
GET  /telemetry/{session_key}?drivers=VER,NOR,HAM → selected driver telemetry
POST /admin/clear-cache/{session_key}   → clears cached analysis + raw endpoints
GET  /chat/health                       → Ollama reachability + model status
POST /chat                              → race engineer answer (Ollama-backed)
```

Interactive docs at `http://localhost:8000/docs` when the backend is running.

---

## Tech stack

**Backend:** Python 3.11 · FastAPI 0.111 · Pydantic v2 · httpx · Polars · NumPy · FastF1 optional · Ollama

**Frontend:** Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · Framer Motion · Zustand · Recharts

**Typography:** Barlow Condensed (display) · Barlow (body) · JetBrains Mono (data)

**Data:** [OpenF1](https://openf1.org) REST API — free and unauthenticated for historical sessions

---

## Disclaimer

This is an unofficial personal project. It is not affiliated with, endorsed by, or connected to Formula 1, the FIA, or any F1 team. All data is sourced from [OpenF1](https://openf1.org), which is also an unofficial community project. Driver names, team names, and race results are factual information, not trademarks being claimed.
