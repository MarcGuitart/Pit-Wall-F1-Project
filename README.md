# Pit Wall IQ

**Watch F1 like an engineer, not like a spectator.**

Race strategy intelligence dashboard. Every screen answers a strategic question.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router) · TypeScript · TailwindCSS · Framer Motion · Recharts · Zustand |
| Backend | FastAPI · Pydantic v2 · httpx · Polars · NumPy |
| AI chat | Ollama (`llama3.1:8b`) — local, no API key required |
| Data | OpenF1 REST API (historical, free) |

---

## Quick start

```bash
# 1. Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload

# 2. Frontend
cd frontend
npm install
cp .env.local.example .env.local
npm run dev

# 3. Ollama (for AI chat)
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3.1:8b
ollama serve
```

Open http://localhost:3000

---

## V2 Architecture

### Strategy View vs Data View

Every analysis page has two modes controlled by a toggle in the top bar:

| Mode | Purpose | Default? |
|------|---------|---------|
| **Strategy View** | Visual, editorial — 7 curated modules answering the key strategic question | ✓ Yes |
| **Data View** | Full analytical tables — every driver, every stint, every stop, exclusion log | No |

Strategy View is always the default. Data View is one click away.

### Session-aware modules

Modules render based on session type. Race-only modules never appear in Qualifying or Practice views.

| Module | Race | Qualifying | Practice |
|--------|------|------------|----------|
| RaceBrainV2 | ✓ | ✓ | ✓ |
| TruePacePodium | ✓ | ✓ | ✓ |
| TyreCliffMap | ✓ | — | — |
| PitSequenceSummary | ✓ | — | — |
| ChaosProfile | ✓ | ✓ | — |
| TrackEvolutionPanel | — | ✓ | ✓ |
| SectorStrengthMap | — | ✓ (stub) | — |
| RunTimingPanel | — | ✓ (stub) | — |
| EngineerSignalSummary | ✓ | ✓ | ✓ |
| KeyDecisionCards | ✓ | ✓ | — |
| DRSTrainDetector | ✓ (stub) | — | — |
| WeatherOverlay | ✓ (stub) | — | — |

### Driver Focus Mode

Click any driver in any panel (pace podium, cliff map, pit summary) to activate focus mode.

A blue strip appears at the top of the analysis area. Engineer signals filter to that driver's events. The chat button changes to "Ask about {CODE} →".

State is global (Zustand). Any panel can activate focus. Click "✕ Clear focus" to reset.

### Data credibility affordances

Every derived metric carries:
- **MethodologyBadge** (⚙) — shows how the metric is calculated
- **EstimatedLabel** — italic "estimated from OpenF1 data" below derived values

Raw OpenF1 values (`lane_duration`, `lap_duration`) do not get these labels.

---

## AI Chat — Ollama architecture

```
RadioOverlay
  → POST /chat (FastAPI)
  → ChatService.build_chat_context(session_key, focused_driver)
      → compact JSON ≤800 tokens (never raw OpenF1 arrays)
  → Ollama /api/chat (llama3.1:8b, temperature=0.3)
  → Grounded answer citing specific laps and data
  → Response to frontend
```

The `/chat` endpoint requires that `/analysis/{session_key}` has been called first — it loads from the local `_analysis.json` cache. No re-running the pipeline per question.

**Ollama setup:**

```bash
# macOS / Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Pull model (~4.7 GB)
ollama pull llama3.1:8b

# Start server (runs on :11434 by default)
ollama serve
```

Alternative models (lighter): `phi3:mini`, `mistral:7b`

Set in `backend/.env`:
```
OLLAMA_MODEL=phi3:mini
```

**Fallback:** If Ollama is not running, the chat returns: `"Engineer radio unavailable. Check that Ollama is running: ollama serve"` — the app does not crash.

---

## Demo races

| Session Key | Race | Why it's a good demo |
|------------|------|---------------------|
| 9636 | Brazilian GP 2024 | Chaos 100/Extreme — rain, SC×2, VSC, red flag |
| 9539 | Spanish GP 2024 | Clean strategic race — undercut showcase |
| 9566 | Hungarian GP 2024 | High tyre degradation — cliff map showcase |

---

## Environment variables

**Backend** (`backend/.env`):
```
OPENF1_BASE_URL=https://api.openf1.org/v1
CACHE_DIR=./cache
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
```

**Frontend** (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Key technical rules

1. Backend calculates everything. Frontend only renders.
2. Never use `pit_duration` — use `lane_duration` (deprecated field).
3. Never use `segments_sector_*` for race data — not available during races.
4. `position_at_lap()` uses timestamp interpolation, not lap-number lookup.
5. Cache raw OpenF1 responses forever for historical sessions (no TTL).
6. `asyncio.Semaphore(3)` on all concurrent OpenF1 requests.
7. EngineerNotes are deterministic templates — no LLM generation.
8. Context sent to Ollama is always the compact `build_chat_context()` output.
9. Strategy View is always the default. Never open on Data View.
10. Race-only modules MUST NOT render for Qualifying or Practice sessions.
