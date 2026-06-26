<div align="center">

# Pit Wall IQ

### Watch F1 like an engineer, not like a spectator.

**Pit Wall IQ** is a post-race strategy intelligence dashboard that transforms raw Formula 1 data into competitive analysis — real pace, tyre degradation, pit stop impact, race phases, weather crossovers, DRS trains, telemetry replay, and an AI race engineer that knows the session.

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-custom%20race%20UI-38BDF8?logo=tailwindcss&logoColor=white)
![OpenF1](https://img.shields.io/badge/Data-OpenF1-E10600)
![Telemetry](https://img.shields.io/badge/Telemetry-throttle%20%7C%20brake%20%7C%20speed%20%7C%20gear-7C3AED)
![AI](https://img.shields.io/badge/AI-Ollama%20local-black)

</div>

<!-- screenshot -->

---

## What it does

After a Formula 1 race, the broadcast tells you who finished where. Pit Wall IQ tries to answer the harder question: **why did that happen?** It surfaces the underlying story — who was actually fast when you strip out safety cars and traffic, who gained or lost positions through pit timing, where tyres started to fall off the cliff, and which decisions shaped the final order.

The pipeline is straightforward: the backend fetches raw data from OpenF1 across eight endpoints (laps, stints, pit stops, position, intervals, race control, weather, driver metadata), caches it per session, then runs a sequence of analytical services that build a single canonical `RaceTimeline` object. Every service reads from the same timeline, which keeps the analysis consistent across modules. The result is a typed `FullRaceAnalysis` JSON payload served to the Next.js frontend.

What makes it more than a timing table is the layer of interpretation on top of the data. Clean laps are separated from safety car and traffic-affected laps before pace is ranked. Pit stop impact is calculated using timestamp-interpolated position data, not just lap numbers. Weather crossovers track which drivers were early, on-time, or late relative to when conditions changed — and flag when a safety car happened to coincide with the window. The telemetry replay lets you watch any driver's throttle, brake, gear, and speed trace with a synchronised circuit map.

---

## Features

| Feature | What it answers |
|---|---|
| **True Pace Ranking** | Who was actually fast, ignoring traffic, pit laps, and safety car periods? |
| **Tyre Degradation Tracker** | Which stints were degrading, and who was close to a tyre cliff? |
| **Pit Stop Impact** | Did that pit stop gain or lose positions? How long was the lane stop? |
| **Race Phase Timeline** | How did the race break down into phases — opening, pit window, SC reset, final push? |
| **Race DNA Card** | What kind of race was this? Tyre management, strategy sensitivity, overtaking difficulty. |
| **DRS Train Detection** | Which drivers were stuck in DRS trains, and for how long did they last? |
| **Chaos Index** | How much did safety cars, yellows, penalties, rain, and position volatility affect the race? |
| **Weather Winners & Losers** | Who timed the weather crossover well, and who got caught on the wrong tyre? |
| **Circuit Telemetry Replay** | How did each driver actually drive — throttle, brake, gear, speed, G-forces — lap by lap? |
| **AI Race Engineer** | What does the data say about a specific moment or decision in this session? |

---

## Architecture

The backend is a FastAPI application with an async OpenF1 client (httpx, `asyncio.Semaphore(3)` for concurrency, three-attempt exponential backoff). All OpenF1 responses are cached as JSON files per session and treated as immutable for historical races — no TTL, no re-fetch. The central design decision is a `RaceTimeline` object built once per session from all raw data, which every downstream service uses as its source of truth. This avoids each service independently resolving timestamps and lap boundaries. Data processing uses Polars; models are Pydantic v2.

The frontend is Next.js 14 with the App Router, TypeScript strict mode, a custom Tailwind design system (no default palette), Framer Motion for transitions, and Zustand for race state. The interface separates analysis into two modes (Strategy View and Data View) and five tabs: Strategy, Tyre & Pit, Weather, Race Control, and Telemetry. The Circuit Telemetry Replay tab uses FastF1 for lap data and renders everything in animated SVG — no canvas, no external charting libraries for the telemetry panel.

```
OpenF1 API
↓
FastAPI backend (Python)
├── Async client (httpx + semaphore + retry)
├── File-based JSON cache (per session_key)
├── RaceTimeline builder (canonical object, shared across all services)
└── Services: pace · tyre · pit · chaos · dna · drs · weather · crossover
             race_phase · clean_air · notes · decisions · telemetry
↓
FullRaceAnalysis (typed Pydantic model, cached as _analysis.json)
↓
Next.js 14 frontend (TypeScript)
├── Strategy View / Data View toggle
├── 5 tabs: Strategy · Tyre & Pit · Weather · Race Control · Telemetry
├── Circuit Telemetry Replay (FastF1 + animated SVG, G-G diagram)
└── AI Race Engineer chat (Ollama, session context injected as system prompt)
```

---

## Tech stack

| Layer | Tech |
|---|---|
| Backend | Python 3.11, FastAPI, Pydantic v2, httpx, Polars, NumPy |
| Frontend | Next.js 14, TypeScript strict, Tailwind CSS, Framer Motion, Zustand, Recharts |
| Telemetry | FastF1, NumPy, SVG animation |
| Data | OpenF1 REST API, file-based JSON cache per session |
| AI | Ollama (local), llama3.1:8b |

---

## Local setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Ollama with `llama3.1:8b` (optional — AI chat only)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

### AI race engineer (optional)

```bash
ollama pull llama3.1:8b
ollama serve
```

The chat feature works without Ollama — it degrades gracefully with a clear message rather than breaking the rest of the analysis.

---

## Data source

Data via [OpenF1](https://openf1.org) — free, no API key required for historical sessions. Historical race data is available from 2023 onwards. The backend caches all OpenF1 responses per session key and endpoint, so loading a race a second time is near-instant and works offline. Cache files are treated as immutable for past sessions.

---

## License

MIT. Not affiliated with Formula 1, FIA, or any F1 team.  
OpenF1 data is used under their open data terms.
