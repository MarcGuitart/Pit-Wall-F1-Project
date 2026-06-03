# PIT WALL IQ — CLAUDE CODE MASTER BRIEF

## Project identity
Pit Wall IQ is a premium Formula 1 race strategy intelligence dashboard.
Tagline: "Watch F1 like an engineer, not like a spectator."
This is NOT a countdown, calendar, live timing clone, or raw data viewer.
Every screen must answer a strategic question. If it doesn't, it doesn't ship.

---

## Tech stack — no deviations

### Frontend
- Next.js 14 (App Router)
- TypeScript (strict mode)
- TailwindCSS (custom config — use design tokens below, NO default palette)
- Framer Motion (page transitions + loading states)
- Recharts (lap pace charts, degradation slopes)
- Zustand (global race state)
- Google Fonts: Barlow Condensed + Barlow + JetBrains Mono

### Backend
- FastAPI (Python 3.11+)
- Pydantic v2
- httpx (async OpenF1 client)
- Polars (data processing — faster than Pandas for this use case)
- asyncio.Semaphore(3) for concurrent OpenF1 fetches
- File-based JSON cache (no TTL for historical sessions)

### Monorepo structure
```
pit-wall-iq/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── cache.py          # file-based JSON cache
│   │   ├── clients/
│   │   │   └── openf1_client.py  # httpx async + semaphore + retry
│   │   ├── services/
│   │   │   ├── race_loader.py    # fetch + join all endpoints
│   │   │   ├── pace_service.py   # True Pace Ranking
│   │   │   ├── tyre_service.py   # Tyre Degradation
│   │   │   ├── pit_service.py    # Pit Stop Impact
│   │   │   ├── chaos_service.py  # Chaos Index
│   │   │   ├── notes_service.py  # Engineer Notes
│   │   │   └── decisions_service.py # 5 Decisions
│   │   ├── api/
│   │   │   ├── races.py          # GET /races, GET /races/{mk}/sessions
│   │   │   ├── analysis.py       # GET /analysis/{session_key}
│   │   │   └── admin.py          # POST /admin/clear-cache/{session_key}
│   │   └── domain/
│   │       ├── models.py         # Pydantic models
│   │       └── enums.py
│   ├── cache/                    # gitignored, auto-created
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Landing / Race Selector
│   │   └── race/[sessionKey]/
│   │       └── page.tsx          # Analysis Page
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx
│   │   │   └── TopBar.tsx
│   │   ├── landing/
│   │   │   └── RaceSelector.tsx
│   │   ├── analysis/
│   │   │   ├── RaceBrain.tsx
│   │   │   ├── TruePaceTable.tsx
│   │   │   ├── TyreDegradationPanel.tsx
│   │   │   ├── PitImpactPanel.tsx
│   │   │   ├── ChaosIndexCard.tsx
│   │   │   ├── EngineerNotes.tsx
│   │   │   ├── DecisionsTimeline.tsx
│   │   │   └── DriverCard.tsx    # per-driver poster view
│   │   ├── radio/
│   │   │   ├── RadioTrigger.tsx  # topbar button with idle wave animation
│   │   │   └── RadioOverlay.tsx  # overlay with opening wave anim + chat UI
│   │   └── ui/
│   │       ├── MetricCard.tsx
│   │       ├── StatusPill.tsx
│   │       ├── DriverChip.tsx
│   │       └── RiskBadge.tsx
│   ├── lib/
│   │   ├── api.ts                # typed fetch to backend
│   │   ├── format.ts             # lap time formatting helpers
│   │   └── constants.ts          # team colors
│   ├── stores/
│   │   └── raceStore.ts
│   ├── types/
│   │   └── index.ts              # all TypeScript types
│   └── tailwind.config.ts
├── docs/
│   ├── api-contract.md
│   └── scoring-methodology.md
└── CLAUDE.md                     # this file
```

---

## Design tokens — implement exactly, no deviations

```typescript
// tailwind.config.ts — extend colors with these
colors: {
  bg: {
    primary:   '#05060A',
    secondary: '#0B0D12',
    panel:     '#111419',
    elevated:  '#181C23',
  },
  border: {
    subtle: '#1E2430',
    default: '#252D3A',
  },
  text: {
    primary:   '#F0F2F5',
    secondary: '#8A94A6',
    muted:     '#4A5568',
  },
  signal: {
    green:  '#23D18B',
    amber:  '#FFB020',
    red:    '#E8001D',
    blue:   '#4DA3FF',
    purple: '#A66CFF',
  }
}

// fonts
fontFamily: {
  display: ['Barlow Condensed', 'sans-serif'],
  body:    ['Barlow', 'sans-serif'],
  mono:    ['JetBrains Mono', 'monospace'],
}
```

Panel styling rule: `bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden`
Panel header rule: `px-3 py-2 border-b border-border-subtle flex items-center justify-between`
Panel title rule: `font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary`

---

## OpenF1 API — validated session keys

Base URL: `https://api.openf1.org/v1`
Historical data: free, no auth required.
Live data: requires paid subscription + MQTT/WebSocket.

### Demo race sessions (use these for development)
| session_key | Race | Notes |
|-------------|------|-------|
| 9636 | Brazil 2024 | Chaos 94 — SC + rain + VSC lap 58 |
| 9539 | Spain 2024 | Clean strategic race, good for pace/tyre |
| 9566 | Hungary 2024 | High degradation, clear pit sequences |
| 9617 | US GP 2024 Austin | Has stop_duration field available |

### Endpoints to fetch per session
```python
endpoints = [
    "laps",         # lap_duration, is_pit_out_lap, date_start, sectors
    "stints",       # compound, lap_start, lap_end, tyre_age_at_start
    "pit",          # lane_duration, stop_duration (post USGP24), lap_number
    "position",     # driver_number, position, date (TIMESTAMP-BASED, not lap-based)
    "intervals",    # gap_to_leader, interval, date
    "race_control", # flag events, SC/VSC messages (free text — use keyword matching)
    "weather",      # rainfall, track_temperature, air_temperature
    "drivers",      # driver_number → name_acronym, team_name, team_colour
]
```

### Known data quirks — handle these
1. `segments_sector_*` are NOT available during races (only qualifying). Do not use for clean lap detection.
2. `stop_duration` only exists from USGP 2024 (session_key 9617) onwards. Always optional.
3. `pit_duration` is DEPRECATED — never use it. Use `lane_duration`.
4. `position` data is timestamp-based, NOT lap-number-based. Implement `position_at_lap()`.
5. `headshot_url` points to Formula 1 CDN — may break. Use team colour + acronym as fallback.
6. `tyre_age_at_start` in stints — treat as `Optional[int]`, may be null.
7. `intervals` updates every ~4 seconds. For historical post-race, density is acceptable.
8. `country_code` in drivers is deprecated (removed end of 2026 season).

---

## Backend implementation specs

### openf1_client.py
```python
# Must implement:
# - httpx.AsyncClient with timeout=30
# - asyncio.Semaphore(3) — max 3 concurrent requests
# - Retry: 3 attempts, exponential backoff (1s, 2s, 4s)
# - fetch_all(session_key) — fetch all 8 endpoints concurrently (within semaphore)
# - Returns dict[endpoint_name, list[dict]]
```

### cache.py
```python
# File-based JSON cache
# Path: cache/{session_key}/{endpoint}.json
# Historical sessions = immutable = no TTL
# create_dirs_if_missing()
# get(session_key, endpoint) -> list | None
# set(session_key, endpoint, data) -> None
# clear(session_key) -> None  # used by /admin endpoint
```

### position_at_lap() — CRITICAL FUNCTION
```python
def position_at_lap(
    driver_number: int,
    lap_number: int,
    position_data: list[dict],
    laps_data: list[dict]
) -> int | None:
    """
    Position data is timestamp-based. Find position for a driver
    at a specific lap using lap.date_start as temporal anchor.
    Find nearest valid position record before or at that timestamp.
    """
```

### clean lap definition — what to exclude
A lap is excluded from True Pace calculations if:
1. `lap_duration` is None
2. `is_pit_out_lap` is True
3. lap_number is a pit-in lap (inferred from pit data)
4. lap overlaps with SC, VSC, or significant yellow flag period (from race_control)
5. lap_duration is a statistical outlier vs driver median (>2.5 IQR)
6. fewer than 3 sector durations available (incomplete lap data)

Each TruePaceRow MUST include:
```python
exclusion_log: list[str]  # e.g. ["3 laps excluded: SC/VSC", "2 laps excluded: pit in/out"]
```

### Degradation slope calculation
```python
# For each stint:
# x = lap_index_within_stint (0, 1, 2, ...)
# y = clean lap_duration values
# slope = numpy polyfit(x, y, deg=1)[0]
# cliff_risk: slope >= 0.08 → High, >= 0.04 → Medium, else Low
# confidence: len(clean_laps) >= 12 → High, >= 6 → Medium, else Low
```

### Chaos Index components
```python
def compute_chaos_index(race_control, weather, position_data) -> ChaosIndex:
    score = 0
    sc_count    = count_keywords(race_control, ["SAFETY CAR", "VIRTUAL SAFETY CAR", "VSC"])
    yellow_count= count_keywords(race_control, ["YELLOW"])
    invest_count= count_keywords(race_control, ["INVESTIGATION", "NOTED", "UNDER INVESTIGATION"])
    penalty_cnt = count_keywords(race_control, ["TIME PENALTY", "DRIVE THROUGH", "STOP AND GO"])
    rain_events = count_rainfall(weather)
    pos_volatility = compute_position_changes(position_data)

    score += min(sc_count * 15, 30)
    score += min(yellow_count * 3, 20)
    score += min(invest_count * 5, 20)
    score += min(penalty_cnt * 4, 15)
    score += min(rain_events * 10, 15)
    score += min(pos_volatility // 5, 20)
    score = min(score, 100)

    # peak_chaos_lap: lap with highest concentration of events
    return ChaosIndex(score=score, level=level_from_score(score),
                      peak_chaos_lap=find_peak_lap(...), components={...}, summary="...")
```

---

## Pydantic models (domain/models.py)

```python
from pydantic import BaseModel
from typing import Optional, Literal

class RaceMeta(BaseModel):
    meeting_key: int
    session_key: int
    meeting_name: str
    session_name: str
    circuit_short_name: Optional[str]
    country_name: Optional[str]
    year: int

class RaceBrain(BaseModel):
    race_phase: str
    main_question: str
    chaos_index: int
    best_compound: Optional[str]
    strategic_tension: Literal["Low", "Medium", "High"]
    summary: str

class TruePaceRow(BaseModel):
    driver_number: int
    driver_code: str
    team_name: Optional[str]
    team_colour: Optional[str]
    rank: int
    median_lap: float          # seconds
    clean_pace: float          # seconds
    traffic_score: float
    sample_size: int
    confidence: Literal["Low", "Medium", "High"]
    exclusion_log: list[str]
    verdict: str

class TyreDegradationRow(BaseModel):
    driver_number: int
    driver_code: str
    compound: str
    stint_number: int
    lap_start: int
    lap_end: int
    tyre_age_start: Optional[int]
    degradation_slope: float
    cliff_risk: Literal["Low", "Medium", "High"]
    confidence: Literal["Low", "Medium", "High"]

class PitImpactRow(BaseModel):
    driver_number: int
    driver_code: str
    lap_number: int
    lane_duration: Optional[float]
    stop_duration: Optional[float]    # None for pre-USGP24 races
    position_before: Optional[int]
    position_after: Optional[int]
    net_position_change: Optional[int]
    verdict: str
    confidence: Literal["Low", "Medium", "High"]

class ChaosIndex(BaseModel):
    score: int
    level: Literal["Low", "Medium", "High", "Extreme"]
    peak_chaos_lap: Optional[int]
    components: dict[str, int]
    summary: str

class EngineerNote(BaseModel):
    lap_number: Optional[int]
    type: Literal["TYRE_DEGRADATION","UNDERCUT","PIT_IMPACT","CHAOS","TRAFFIC","TRUE_PACE","WEATHER","ANOMALY"]
    severity: Literal["Low", "Medium", "High"]
    title: str
    message: str

class RaceDecision(BaseModel):
    rank: int
    lap_number: Optional[int]
    title: str
    impact: str
    explanation: str
    confidence: Literal["Low", "Medium", "High"]

class FullRaceAnalysis(BaseModel):
    race: RaceMeta
    race_brain: RaceBrain
    true_pace: list[TruePaceRow]
    tyre_degradation: list[TyreDegradationRow]
    pit_impact: list[PitImpactRow]
    chaos: ChaosIndex
    engineer_notes: list[EngineerNote]
    decisions: list[RaceDecision]
```

---

## API endpoints

```
GET  /health                           → {"status": "ok"}
GET  /races?year=2024                  → list[RaceMeta]
GET  /races/{meeting_key}/sessions     → list[SessionInfo]
GET  /analysis/{session_key}           → FullRaceAnalysis  (main endpoint)
POST /admin/clear-cache/{session_key}  → {"cleared": true}
```

The `/analysis/{session_key}` endpoint:
1. Check cache for all 8 endpoints
2. Fetch missing endpoints from OpenF1 (semaphore-controlled)
3. Cache raw responses
4. Run all services in sequence
5. Return FullRaceAnalysis JSON

---

## TypeScript types (frontend/types/index.ts)

```typescript
export type RaceMeta = {
  meeting_key: number;
  session_key: number;
  meeting_name: string;
  session_name: string;
  circuit_short_name: string | null;
  country_name: string | null;
  year: number;
};

export type RaceBrain = {
  race_phase: string;
  main_question: string;
  chaos_index: number;
  best_compound: string | null;
  strategic_tension: "Low" | "Medium" | "High";
  summary: string;
};

export type TruePaceRow = {
  driver_number: number;
  driver_code: string;
  team_name: string | null;
  team_colour: string | null;
  rank: number;
  median_lap: number;
  clean_pace: number;
  traffic_score: number;
  sample_size: number;
  confidence: "Low" | "Medium" | "High";
  exclusion_log: string[];
  verdict: string;
};

export type TyreDegradationRow = {
  driver_number: number;
  driver_code: string;
  compound: "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET" | string;
  stint_number: number;
  lap_start: number;
  lap_end: number;
  tyre_age_start: number | null;
  degradation_slope: number;
  cliff_risk: "Low" | "Medium" | "High";
  confidence: "Low" | "Medium" | "High";
};

export type PitImpactRow = {
  driver_number: number;
  driver_code: string;
  lap_number: number;
  lane_duration: number | null;
  stop_duration: number | null;
  position_before: number | null;
  position_after: number | null;
  net_position_change: number | null;
  verdict: string;
  confidence: "Low" | "Medium" | "High";
};

export type ChaosIndex = {
  score: number;
  level: "Low" | "Medium" | "High" | "Extreme";
  peak_chaos_lap: number | null;
  components: {
    safety_car: number;
    yellow_flags: number;
    investigations: number;
    penalties: number;
    weather: number;
    position_volatility: number;
  };
  summary: string;
};

export type EngineerNote = {
  lap_number: number | null;
  type: "TYRE_DEGRADATION" | "UNDERCUT" | "PIT_IMPACT" | "CHAOS" | "TRAFFIC" | "TRUE_PACE" | "WEATHER" | "ANOMALY";
  severity: "Low" | "Medium" | "High";
  title: string;
  message: string;
};

export type RaceDecision = {
  rank: number;
  lap_number: number | null;
  title: string;
  impact: string;
  explanation: string;
  confidence: "Low" | "Medium" | "High";
};

export type FullRaceAnalysis = {
  race: RaceMeta;
  race_brain: RaceBrain;
  true_pace: TruePaceRow[];
  tyre_degradation: TyreDegradationRow[];
  pit_impact: PitImpactRow[];
  chaos: ChaosIndex;
  engineer_notes: EngineerNote[];
  decisions: RaceDecision[];
};

// Race selector types
export type RaceListItem = {
  meeting_key: number;
  meeting_name: string;
  country_name: string;
  circuit_short_name: string;
  date_start: string;
  year: number;
};

export type SessionInfo = {
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
};
```

---

## Frontend component specs

### Loading state (AnalysisLoadingScreen)
Sequence of messages shown while `/analysis/{session_key}` loads:
```
"Fetching timing data…"
"Loading stints and pit data…"
"Filtering clean laps…"
"Reconstructing race timeline…"
"Calculating tyre degradation slopes…"
"Detecting pit stop impact…"
"Computing chaos index…"
"Generating engineer notes…"
```
Show animated progress steps, elapsed timer. Premium feel — not a generic spinner.

### RadioTrigger (topbar button)
- Small button in topbar: idle sine wave animation (CSS keyframes) + "Talk to engineer" label
- On click: opens RadioOverlay
- Wave bars animate slowly when idle

### RadioOverlay (chat panel)
- Opens from bottom as sheet overlay
- On open: shows OPENING ANIMATION (2.1 seconds):
  - "Pit wall comms · channel {session_key}"
  - "Race Engineer" title
  - Animated waveform bars (F1 team radio style) — bars pulse with random heights
  - "Establishing session context…" with blinking dot
- After animation: waveform bars collapse to flat → chat UI slides in
- Chat UI:
  - Header: emblem + "Race Wall Engineer" + session sub + status pill + close button
  - Context pills: chaos score, laps count, data sources loaded
  - Messages: engineer (green left-border accent) + user (red tinted)
  - 4 suggested question buttons (2×2 grid) with purple left-border accent
  - Composer: textarea + send button
  - Grounded mode note: "answers cite session signals"
- Close: X button or click outside overlay
- The AI endpoint: calls `/api/engineer-chat` which calls Anthropic API with session context injected as system prompt

### Engineer Chat — AI integration
The `/api/engineer-chat` Next.js API route:
```typescript
// app/api/engineer-chat/route.ts
// POST { question: string, session_key: number, race_context: FullRaceAnalysis }
// Calls Anthropic API (claude-sonnet-4-20250514)
// System prompt injects: race_brain, true_pace top 5, tyre_degradation, pit_impact, chaos, engineer_notes
// Instructs model: "You are a race engineer. Answer in 2-4 sentences, cite specific laps and data. Technical, direct tone."
// Returns: { answer: string }
```

### Mode toggle (Historical / Live)
- In TopBar, right side
- Historical (default): loads from `/analysis/{session_key}` (cached analysis)
- Live: shows "Live mode coming soon" toast for now (placeholder)
- Keep the toggle visible and functional — it's a product promise

### DriverCard component
Per-driver poster view (accessible from TruePaceTable row click):
- Left panel: team color gradient bg, driver number watermark, name, circuit SVG (animated stroke on load), result/grid/pace stats, team radio quote
- Right panel: stint map (colored blocks per compound), lap pace bar chart, key metrics table, key decision summary
- Triggered by clicking a driver row — could be modal or inline expand

---

## Engineer Notes — deterministic generation (NO hallucination)

Notes are generated from real computed data, not invented by AI.
Templates:

```python
# Tyre cliff
f"Lap {lap} — {driver_code} {compound} degradation slope reached +{slope:.3f} s/lap. {cliff_risk} cliff risk."

# Undercut
f"Lap {pit_lap} — {attacker} pits before {target} (gap {gap:.1f}s). Emerged {result} after pit cycle."

# Pit impact
f"Lap {pit_lap} — {driver_code} stop: lane {lane:.1f}s. Net position change: {delta:+d}. Verdict: {verdict}."

# SC/VSC
f"Lap {lap} — {event_type} deployed. {affected_count} drivers affected. Race control: '{message_snippet}'."

# Weather
f"Lap {lap} — Rainfall detected. Track temperature {track_temp}°C. Strategy window opens."
```

---

## Mock data file (for frontend-first development)

```
frontend/lib/mock/brazil_2024.json
```
Must match FullRaceAnalysis type exactly. Use session_key 9636, Brazilian GP 2024.
Include at least: 5 TruePaceRows, 6 TyreDegradationRows, 4 PitImpactRows, full ChaosIndex, 8 EngineerNotes, 5 RaceDecisions.

---

## Build order

### Phase 1 — Frontend with mock data (day 1)
1. `npx create-next-app@latest frontend --typescript --tailwind --app`
2. Configure tailwind.config.ts with design tokens above
3. Install Google Fonts (Barlow Condensed, Barlow, JetBrains Mono) via next/font
4. Build AppShell + TopBar (with mode toggle + RadioTrigger placeholder)
5. Build Landing page + RaceSelector
6. Build AnalysisLoadingScreen
7. Build analysis page layout (grid structure)
8. Build all analysis panels with mock data: RaceBrain, TruePaceTable, TyreDegradationPanel, PitImpactPanel, ChaosIndexCard, EngineerNotes, DecisionsTimeline
9. Build RadioOverlay with opening animation + chat UI
10. Build DriverCard component
11. Wire mock data through Zustand store

### Phase 2 — Backend (day 1-2)
1. `pip install fastapi uvicorn httpx polars pydantic numpy`
2. Implement cache.py (file-based)
3. Implement openf1_client.py (async + semaphore + retry)
4. Implement race_loader.py (fetch all + join data)
5. Implement position_at_lap() utility
6. Implement pace_service.py
7. Implement tyre_service.py
8. Implement pit_service.py
9. Implement chaos_service.py
10. Implement notes_service.py
11. Implement decisions_service.py
12. Wire FastAPI routes: /health, /races, /analysis/{session_key}, /admin/clear-cache/{session_key}
13. Test with session_key 9636 (Brazil 2024) and 9539 (Spain 2024)

### Phase 3 — Connect + AI chat (day 2)
1. Replace mock data with real API calls in frontend (lib/api.ts)
2. Implement /api/engineer-chat Next.js route (Anthropic SDK)
3. Wire RadioOverlay to real chat endpoint
4. Test full flow: selector → loading → analysis → chat
5. Validate 3 demo races render correctly

### Phase 4 — Polish (day 2-3)
1. Framer Motion: page transitions, panel entrance animations
2. Loading screen step animations
3. RadioOverlay opening waveform animation (refined)
4. DriverCard circuit SVG stroke animation
5. Error states (OpenF1 unavailable, no data, low confidence warnings)
6. Responsive layout (desktop-first, tablet acceptable)

---

## Critical rules — never break these

1. Backend calculates everything. Frontend only renders. No analytical logic in React.
2. Never use `pit_duration` — use `lane_duration`. It is deprecated.
3. Never use `segments_sector_*` for race data — not available during races.
4. Always show `confidence` badges. Never present estimates as perfect truth.
5. Always include `exclusion_log` in TruePaceRow. Users will question the numbers.
6. `position_at_lap()` must use timestamp interpolation, not naive lap-number lookup.
7. Cache raw OpenF1 responses forever for historical sessions. No TTL.
8. Semaphore(3) on OpenF1 concurrent requests. Never unbounded parallel fetch.
9. EngineerNotes are deterministic (template-based). No LLM inventing data.
10. RadioOverlay chat uses Anthropic API with real session context injected as system prompt.
11. Design tokens must be used — no hardcoded hex in components.
12. The mock data file must match FullRaceAnalysis type exactly before Phase 2 starts.

---

## Environment variables needed

```bash
# backend/.env
OPENF1_BASE_URL=https://api.openf1.org/v1
CACHE_DIR=./cache

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
ANTHROPIC_API_KEY=sk-ant-...   # for engineer chat
```

---

## Demo races for launch

| Race | session_key | Why it's a good demo |
|------|-------------|----------------------|
| Brazilian GP 2024 | 9636 | Extreme chaos (94), rain, SC, VSC, championship drama |
| Spanish GP 2024 | 9539 | Clean strategic race — undercut showcase |
| Hungarian GP 2024 | 9566 | High tyre degradation — degradation panel showcase |

---

## Out of scope for MVP v1 (do not implement)

- Real-time / Live mode (placeholder toggle only)
- User auth / login
- ML predictions
- Team radio transcription
- Championship simulator
- 3D track map
- Social features
- Multi-race comparison
- Telemetry (throttle/brake as main feature)
- Any F1 official branding, logos, or trade dress