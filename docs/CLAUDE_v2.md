# PIT WALL IQ — V2 ARCHITECTURE UPDATE
# Append this to CLAUDE.md or use as override for refactor work.
# This document supersedes UI/UX sections of the original CLAUDE.md.

---

## What changed in V2

V1 shipped a working dashboard but the analysis page was too data-heavy,
too long, and too table-driven. It felt like a log viewer, not a strategy tool.

V2 fixes this with four structural changes:

1. Strategy View / Data View toggle — default is visual, detailed is one click away
2. Session-aware modules — Race ≠ Qualifying ≠ Practice. Wrong modules don't render.
3. Session Timeline Bar — horizontal race overview at the top of every analysis page
4. Driver Focus Mode — click any driver anywhere to filter the whole view
5. Ollama local AI for chat — no Anthropic API key required in production

The aesthetics, typography, color tokens, and chat style do NOT change.
The backend API contract does NOT change.
The Pydantic models do NOT change.

---

## New component tree (additions and changes only)

### New components to create

components/analysis/
  AnalysisModeToggle.tsx       # Strategy | Data toggle, lives inside analysis page
  SessionTimelineBar.tsx       # Horizontal race/session timeline with events
  DriverFocusStrip.tsx         # Blue strip shown when a driver is focused
  StrategyViewGrid.tsx         # Parent container for Strategy View layout

components/analysis/strategy/
  RaceBrainV2.tsx              # Restructured: phase → question → verdict → metrics
  TruePacePodium.tsx           # Top 3 podium cards only (was full table)
  TyreCliffMap.tsx             # Three-column risk grouping (High/Med/Stable)
  TrackEvolutionPanel.tsx      # Qualifying/Practice only — replaces TyreCliffMap
  PitSequenceSummary.tsx       # Winners + Losers only (was full pit table)
  ChaosProfile.tsx             # Compact score + bars + event density timeline
  EngineerSignalSummary.tsx    # Grouped by type, filter chips, top 5 only
  KeyDecisionCards.tsx         # Editorial cards, max 5 (was list)

components/analysis/data/
  DataViewTables.tsx           # Wrapper for all full analytical tables
  FullPaceTable.tsx            # Was TruePaceTable.tsx
  FullDegradationTable.tsx     # Was TyreDegradationPanel.tsx
  FullPitImpactTable.tsx       # Was PitImpactPanel.tsx
  FullEngineerNotes.tsx        # Was EngineerNotes.tsx
  ExclusionLogPanel.tsx        # New — shows exclusion_log per driver

components/ui/
  PitWallSelect.tsx            # Custom select replacing all native <select>
  MethodologyBadge.tsx         # Small ⚙ button with tooltip/modal
  ConfidenceChip.tsx           # Low/Med/High confidence badge
  EstimatedLabel.tsx           # "estimated from OpenF1 data" italic label

components/chat/
  RadioOverlay.tsx             # Unchanged styling — backend endpoint changes

---

## AnalysisModeToggle

```typescript
type AnalysisModeToggleProps = {
  mode: "strategy" | "data"
  sessionType: "Race" | "Qualifying" | "Practice"
  lapCount: number
  onChange: (mode: "strategy" | "data") => void
}
```

Placement: below race header, above first content panel.
Left side: toggle buttons (Strategy View | Data View).
Right side: context hint — "Strategy View · Race session · {lapCount} laps indexed"

Style matches Historical/Live toggle but uses bg-bg-elevated base,
active state = bg-bg-primary with inset border, NOT red background.
Red is reserved for Historical/Live and the radio button.

---

## SessionTimelineBar

Shows the full session as a horizontal bar with:
- Colored segments: green (racing), amber (SC), red (VSC), blue (rain/wet)
- Vertical event markers: pit stops (1px lines per driver color), SC/VSC events
- Lap number labels below: L1, L{quarter}, L{half}, L{3quarter}, L{total}
- Legend row below labels

Props:
```typescript
type SessionTimelineBarProps = {
  totalLaps: number
  sessionType: "Race" | "Qualifying" | "Practice"
  raceControlEvents: RaceControlEvent[]  // from FullRaceAnalysis
  pitEvents: PitImpactRow[]
  chaosIndex: ChaosIndex
}
```

For Qualifying: show run timings instead of lap segments.
For Practice: show stint blocks only, no SC/VSC unless they occurred.

Implementation note: position events as percentage of total laps.
Event at lap N = (N / totalLaps) * 100 + "%"
Do NOT use absolute pixel positioning.

---

## Session-aware module rendering

This is the most important product rule in V2.

```typescript
// In StrategyViewGrid.tsx

const SESSION_MODULES = {
  Race: [
    "RaceBrainV2",
    "TruePacePodium",
    "TyreCliffMap",
    "PitSequenceSummary",
    "ChaosProfile",
    "EngineerSignalSummary",
    "KeyDecisionCards",
  ],
  Qualifying: [
    "QualifyingBrain",       // variant of RaceBrainV2
    "TruePacePodium",        // shows Q3 best lap, not race pace
    "SectorStrengthMap",     // NEW — see below
    "TrackEvolutionPanel",   // replaces TyreCliffMap
    "RunTimingPanel",        // NEW — see below
    "TrafficAndPrepPanel",   // NEW — see below
    "ChaosProfile",          // SC/yellow flags in quali
    "EngineerSignalSummary",
  ],
  Practice: [
    "PracticeBrain",
    "TruePacePodium",
    "TrackEvolutionPanel",
    "LongRunComparisonPanel",
    "EngineerSignalSummary",
  ],
}

// Never render Race-only modules for Qualifying or Practice:
// ❌ PitSequenceSummary in Qualifying
// ❌ TyreCliffMap in Qualifying (use TrackEvolutionPanel instead)
// ❌ UnderscutMoments in Qualifying
// ❌ PitImpact anything in Qualifying
```

---

## New Qualifying-specific modules (stubs for V2)

### SectorStrengthMap
Shows which drivers were strongest in each sector.
Data source: duration_sector_1/2/3 from laps endpoint.
Visual: 3 columns (S1/S2/S3), top 3 drivers per sector with delta to best.
Confidence note: "Sector data from OpenF1 — may be incomplete."

### TrackEvolutionPanel
For Qualifying and Practice.
Shows how track improved across the session:
- Track evolution score (0–100, derived from median lap improvement per run)
- Best time window (which run group had fastest times)
- Benefited drivers (drove late, got faster track)
- Compromised drivers (drove early or caught traffic)

Data source: laps ordered by date_start, grouped into run blocks.

### RunTimingPanel
For Qualifying.
Shows each driver's run sequence:
- Run 1, Run 2, Run 3 (if Q3)
- Best lap per run
- Delta to session best
- Whether the run was clean or traffic-affected

### TrafficAndPrepPanel
For Qualifying.
Flags laps where a driver was likely in traffic or on an out-lap.
Uses is_pit_out_lap + interval data to detect compromised runs.

---

## PitWallSelect component

Replace ALL native <select> elements in the app.

```typescript
type PitWallSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type PitWallSelectProps = {
  label?: string
  value: string
  options: PitWallSelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  width?: string
}
```

Visual spec:
- Background: bg-bg-elevated (#181C23)
- Border: 1px solid border-default (#252D3A)
- Border radius: 3px (sharp, technical)
- Text: Barlow Condensed, 11px, 600 weight, uppercase, letter-spacing 0.5px
- Padding: 6px 28px 6px 10px
- Arrow: custom ▾ character, right 8px, text-muted color
- Focus: border-color → signal-blue + box-shadow 0 0 0 1px rgba(77,163,255,.2)
- Hover: border-color → border-secondary
- Option menu: bg-bg-panel background, same border, no native dropdown styling
- Keyboard accessible: Enter to open, arrow keys to navigate, Escape to close

Use in:
- Landing page: Season selector, Grand Prix selector
- Analysis page header: Session type selector
- Any filter or configuration control

---

## TruePacePodium

Strategy View shows only P1/P2/P3 in a podium layout.

```typescript
type TruePacePodiumProps = {
  rows: TruePaceRow[]           // pass all, component takes top 3
  onDriverClick: (driverCode: string, driverName: string) => void
  sessionType: "Race" | "Qualifying" | "Practice"
}
```

Layout: P2 | P1 | P3 (P1 slightly taller/highlighted)
Each card:
- Position label (P1 in amber, P2/P3 in muted)
- Team color bar (8px wide rect)
- Driver code (Barlow Condensed 900, 20px)
- Team name (10px muted)
- Pace value (JetBrains Mono, 13px)
- Delta to P1 (green for P1 "Fastest", muted for others)
- Confidence chip

Clicking a card fires onDriverClick → activates DriverFocusStrip.
"View full pace table →" button below podium calls onChange("data").

For Qualifying: label changes to "Best Q3 lap" instead of "Clean race pace".
For Practice: label changes to "Best representative lap".

---

## TyreCliffMap

Race sessions only.

```typescript
type TyreCliffMapProps = {
  degradationRows: TyreDegradationRow[]
  onDriverClick: (driverCode: string) => void
}
```

Three columns: High cliff | Medium risk | Stable
Each column:
- Colored header with dot indicator
- Driver rows: team color bar + code + slope value (colored by severity)
- Footer: dominant compound info for that risk group

Cliff classification (from degradation_slope):
- High: slope >= 0.08 → red column
- Medium: 0.04 <= slope < 0.08 → amber column
- Stable: slope < 0.04 → green column

Use worst stint per driver (highest slope) for classification.
If driver has multiple stints, show worst-case.

Bottom row: methodology badge + "slope = s/lap linear regression per stint" label.

---

## PitSequenceSummary

Race sessions only. Strategy View shows top 3 winners + top 3 losers.

```typescript
type PitSequenceSummaryProps = {
  pitImpactRows: PitImpactRow[]
  onDriverClick: (driverCode: string) => void
}
```

Winners = net_position_change > 0, sorted descending.
Losers = net_position_change < 0, sorted ascending (most lost first).

Each row: team bar + driver code + lap + net delta (large) + verdict pill.
If lane_duration data is missing for a session: show one clean warning state.
  "Pit lane timing unavailable for this session — showing position change only."
Do NOT render empty rows. Do NOT render null lane durations as dashes in 20 rows.

"View full pit stop data →" links to Data View.

---

## ChaosProfile

Compact. Replaces the old ChaosIndexCard.

```typescript
type ChaosProfileProps = {
  chaos: ChaosIndex
}
```

Layout: two-column grid
Left: Large score number (44px Barlow Condensed 900) + level label + "Peak: Lap N"
Right: 5 horizontal component bars (2px height, labeled)

Below: Event density mini-timeline
- Same track as SessionTimelineBar but 8px tall, events only (no segments)
- Shows concentration of race control events across laps
- Peak lap highlighted with wider/taller marker

No large empty vertical space. Total height of ChaosProfile: max 160px.

---

## EngineerSignalSummary

Strategy View: grouped, filtered, top 5.

```typescript
type EngineerSignalSummaryProps = {
  notes: EngineerNote[]
  onViewAll: () => void
}
```

Filter chips row: All (N) | Tyre (N) | Undercut (N) | SC/VSC (N) | Pit (N) | Weather (N)
Each chip shows count in parentheses.
Active chip: tinted by type color (amber for tyre, purple for undercut, etc.)
Default: All selected, shows top 5 by severity (High first).

Clicking a chip filters the note list to that type.
Filtering happens in JS — do not re-fetch.
"View all {N} signals →" calls onViewAll which switches to Data View.

Note item: lap number (mono) | type badge | title | message (2 lines max)

---

## KeyDecisionCards

Editorial cards. Max 5. Replaces DecisionsTimeline.

```typescript
type KeyDecisionCardsProps = {
  decisions: RaceDecision[]
}
```

Each card:
- Large rank number (watermark style, very muted color)
- Title (12px, 600 weight)
- Impact line (colored: green/amber/red)
- Explanation (10px, text-secondary, max 2 lines)
- Meta row: lap badge (mono style) + confidence chip

Cards are compact — 3 cards visible without scroll in Strategy View.
"See all 5 decisions" expands inline (not a new view).

---

## DriverFocusStrip

Appears at top of analysis content area when a driver is focused.
Clicking any driver in any panel (podium, cliff map, pit summary) activates it.

```typescript
type DriverFocusStripProps = {
  driverCode: string | null
  driverName: string | null
  onClear: () => void
}
```

Visual: blue-tinted strip (rgba(77,163,255,.06) bg, blue border)
Content: "Focused on: NOR — Lando Norris · showing driver-specific signals"
Right side: "✕ Clear focus" button

When focus is active:
- All panels highlight the focused driver's row
- Engineer signals filter to that driver's notes
- Panels that don't have data for that driver show a subtle empty state
- The chat radio button label changes to "Ask about NOR →"

State management: store focused driver in Zustand raceStore.
focusedDriver: { code: string, name: string } | null

---

## Chat — Ollama local architecture

Replace direct Anthropic API calls with backend /chat endpoint.

### Why Ollama
- No API key needed in production
- OpenAI-compatible endpoint → easy provider switch later
- Works offline during development
- Models: llama3.1:8b (default), mistral:7b, or phi3:mini for low-resource

### Architecture

```
Frontend RadioOverlay
  → POST /chat (FastAPI backend)
  → ChatService.build_context(session_key, question)
  → Ollama REST API (localhost:11434)
  → Grounded answer
  → Response to frontend
```

### Backend /chat endpoint

```python
# app/api/chat.py

class ChatRequest(BaseModel):
    session_key: int
    question: str
    focused_driver: str | None = None  # e.g. "NOR"

class ChatResponse(BaseModel):
    answer: str
    cited_signals: list[str]  # which data points were used
    confidence: str  # "Low" | "Medium" | "High"

@router.post("/chat")
async def chat(req: ChatRequest) -> ChatResponse:
    # 1. Load analysis from cache (already computed)
    analysis = await load_cached_analysis(req.session_key)
    # 2. Build compact context
    context = build_chat_context(analysis, req.focused_driver)
    # 3. Call Ollama
    answer = await call_ollama(context, req.question)
    return ChatResponse(answer=answer, ...)
```

### build_chat_context — CRITICAL

The model does NOT receive raw OpenF1 arrays.
It receives a compact JSON summary (~800 tokens max):

```python
def build_chat_context(analysis: FullRaceAnalysis, focused_driver: str | None) -> str:
    ctx = {
        "session": f"{analysis.race.meeting_name} {analysis.race.year} — {analysis.race.session_name}",
        "race_brain": {
            "phase": analysis.race_brain.race_phase,
            "question": analysis.race_brain.main_question,
            "summary": analysis.race_brain.summary,
            "chaos": analysis.chaos.score,
            "chaos_level": analysis.chaos.level,
            "peak_chaos_lap": analysis.chaos.peak_chaos_lap,
        },
        "pace_top3": [
            {"driver": r.driver_code, "pace": r.clean_pace, "rank": r.rank, "verdict": r.verdict}
            for r in sorted(analysis.true_pace, key=lambda x: x.rank)[:3]
        ],
        "tyre_cliffs": [
            {"driver": r.driver_code, "compound": r.compound, "slope": r.degradation_slope, "cliff": r.cliff_risk}
            for r in analysis.tyre_degradation if r.cliff_risk == "High"
        ],
        "pit_winners": [
            {"driver": r.driver_code, "lap": r.lap_number, "delta": r.net_position_change, "verdict": r.verdict}
            for r in analysis.pit_impact if (r.net_position_change or 0) > 0
        ],
        "pit_losers": [
            {"driver": r.driver_code, "lap": r.lap_number, "delta": r.net_position_change, "verdict": r.verdict}
            for r in analysis.pit_impact if (r.net_position_change or 0) < 0
        ],
        "key_decisions": [
            {"rank": d.rank, "lap": d.lap_number, "title": d.title, "impact": d.impact}
            for d in analysis.decisions
        ],
        "top_signals": [
            {"lap": n.lap_number, "type": n.type, "title": n.title, "message": n.message}
            for n in sorted(analysis.engineer_notes, key=lambda x: {"High":0,"Medium":1,"Low":2}[x.severity])[:6]
        ],
    }

    if focused_driver:
        # Filter to driver-specific data
        ctx["focused_driver"] = focused_driver
        ctx["driver_pace"] = next((r for r in analysis.true_pace if r.driver_code == focused_driver), None)
        ctx["driver_tyres"] = [r for r in analysis.tyre_degradation if r.driver_code == focused_driver]
        ctx["driver_pits"] = [r for r in analysis.pit_impact if r.driver_code == focused_driver]
        ctx["driver_notes"] = [n for n in analysis.engineer_notes if focused_driver in n.message or focused_driver in n.title]

    return json.dumps(ctx, default=str)
```

### System prompt for Ollama

```python
ENGINEER_SYSTEM_PROMPT = """You are the race engineer for {session_name}.
You have access to the race data below. Answer questions like a pit wall engineer:
direct, technical, cite specific laps and data signals.
Keep answers to 2-4 sentences. Never invent data not present in the context.
If the context doesn't contain the answer, say so directly.
Do not use markdown formatting in your response.

Race data:
{context}"""
```

### Ollama call

```python
import httpx

OLLAMA_URL = "http://localhost:11434"
OLLAMA_MODEL = "llama3.1:8b"  # configurable via .env

async def call_ollama(context: str, question: str, session_name: str) -> str:
    system = ENGINEER_SYSTEM_PROMPT.format(
        session_name=session_name,
        context=context
    )
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": question}
        ],
        "stream": False,
        "options": {"temperature": 0.3, "num_predict": 200}
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        r.raise_for_status()
        return r.json()["message"]["content"].strip()
```

### Frontend change

```typescript
// Old: called Anthropic API directly from /api/engineer-chat
// New: calls backend /chat

async function sendToEngineer(question: string, sessionKey: number, focusedDriver: string | null) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_key: sessionKey,
      question,
      focused_driver: focusedDriver,
    }),
  })
  const data = await res.json()
  return data.answer
}
```

### .env additions

```bash
# backend/.env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# frontend/.env.local — remove ANTHROPIC_API_KEY, no longer needed
# ANTHROPIC_API_KEY=...  ← DELETE THIS
```

### Ollama setup (include in README)

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull model
ollama pull llama3.1:8b

# Start (runs on :11434 by default)
ollama serve
```

---

## Data credibility affordances

Add to every analytical module:

### MethodologyBadge

```typescript
// Small ⚙ button that shows a tooltip or modal
type MethodologyBadgeProps = {
  module: "pace" | "degradation" | "pit" | "chaos" | "notes"
}
```

Methodology copy per module:
- pace: "Median of clean lap durations. Excludes pit in/out, SC/VSC laps, statistical outliers (>2.5 IQR). Min 5 clean laps required."
- degradation: "Linear regression slope (s/lap) fitted to clean lap times within each stint. Slope > 0.08 = High cliff."
- pit: "Position delta = position at pit_lap−1 vs position at pit_lap+3, reconstructed from timestamp-based OpenF1 position data."
- chaos: "Weighted sum of SC events (×15), yellows (×3), investigations (×5), penalties (×4), rain (×10), position volatility (÷5). Max 100."
- notes: "Deterministic signals generated from computed metrics. No AI generation — thresholds trigger note templates."

### EstimatedLabel

Small italic label: "estimated from OpenF1 data"
Use below any chart or metric that is derived/approximated (not a raw value).
Raw values (lane_duration, lap_duration) do not need this label.
Derived values (degradation_slope, clean_pace, chaos_score) always get it.

### ExclusionLogPanel (Data View only)

In Data View, show per-driver exclusion log below the full pace table:
```
NOR — 24 clean laps / 71 total
  Excluded: 3 laps (null lap_duration) · 4 laps (pit in/out) · 8 laps (SC/VSC) · 1 lap (outlier)
```

---

## New features to stub (not implement fully in V2 sprint)

These should exist as placeholder panels that show "Coming soon" state.
They inform the product roadmap visually without requiring backend work.

### DRS Train Detector (Race only)
Detect consecutive drivers with interval < 1.0s for N laps.
Placeholder copy: "DRS Train analysis — detecting groups of 3+ drivers within 1s"

### Weather Overlay
Correlate track_temperature and rainfall with lap time evolution.
Placeholder copy: "Weather impact — correlating temperature drops with pace changes"

### Sector Strength Map (Qualifying)
Top driver per sector, delta to best.
Placeholder: show sector column headers with "awaiting qualifying data"

---

## V2 build order

### Sprint 1 — View architecture (day 1)
1. Create AnalysisModeToggle component
2. Create SessionTimelineBar (Race version first)
3. Create DriverFocusStrip + wire to Zustand focusedDriver state
4. Create StrategyViewGrid with session_type routing
5. Create PitWallSelect and replace all native selects
6. Restructure analysis page to show Strategy/Data views correctly
7. Move existing table components into DataViewTables wrapper

### Sprint 2 — Strategy View components (day 1-2)
8. RaceBrainV2 (restructured layout)
9. TruePacePodium (top 3 only + driver click)
10. TyreCliffMap (three-column risk grouping)
11. PitSequenceSummary (winners/losers only)
12. ChaosProfile (compact + event timeline)
13. EngineerSignalSummary (filter chips + top 5)
14. KeyDecisionCards (editorial style)

### Sprint 3 — Chat refactor (day 2)
15. Add /chat endpoint to FastAPI
16. Implement build_chat_context()
17. Implement call_ollama()
18. Remove /api/engineer-chat Next.js route
19. Update RadioOverlay to call backend /chat
20. Wire focused_driver state to chat context

### Sprint 4 — Session awareness (day 2-3)
21. Add session_type detection to analysis page
22. Create TrackEvolutionPanel stub (Qualifying)
23. Create SectorStrengthMap stub (Qualifying)
24. Create RunTimingPanel stub (Qualifying)
25. Validate Race view works end-to-end
26. Validate Qualifying view does NOT show Race modules

### Sprint 5 — Polish + stubs (day 3)
27. MethodologyBadge component + copy for all 5 modules
28. EstimatedLabel applied to derived metrics
29. ExclusionLogPanel in Data View
30. DRS Train placeholder panel
31. Weather Overlay placeholder panel
32. Update README with Ollama setup instructions

---

## Rules that don't change from V1

1. Backend calculates everything. Frontend only renders.
2. Never use pit_duration. Use lane_duration.
3. Never use segments_sector_* for race data.
4. Always show confidence badges. Never present estimates as truth.
5. Always include exclusion_log in TruePaceRow.
6. position_at_lap() must use timestamp interpolation.
7. Cache raw OpenF1 responses forever for historical sessions.
8. Semaphore(3) on OpenF1 concurrent requests.
9. EngineerNotes are deterministic (template-based).
10. Design tokens must be used — no hardcoded hex in components.

## New rules added in V2

11. Strategy View is always the default. Never open on Data View.
12. Race-only modules (PitSequenceSummary, TyreCliffMap, UnderscutMoments) MUST NOT render for Qualifying or Practice sessions.
13. PitWallSelect replaces all native <select> elements. No exceptions.
14. Ollama /chat endpoint replaces direct Anthropic API calls from frontend.
15. Context sent to Ollama is always the compact build_chat_context() output. Never raw arrays.
16. DriverFocusStrip state is global (Zustand). Any panel can activate it.
17. Strategy View must be understandable in under 30 seconds by a new user.
18. Any derived metric (not a raw OpenF1 value) must have an EstimatedLabel nearby.