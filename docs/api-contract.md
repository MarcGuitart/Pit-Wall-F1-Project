# Pit Wall IQ — API Contract

## Base URLs
- Backend: http://localhost:8000
- Frontend: http://localhost:3000
- OpenF1: https://api.openf1.org/v1

## Endpoints

### GET /health
Response: {"status": "ok"}

### GET /races?year=2024
Returns list of race meetings for the year.

### GET /races/{meeting_key}/sessions
Returns sessions for a meeting (Practice 1/2/3, Qualifying, Race, Sprint).

### GET /analysis/{session_key}
Main endpoint. Returns FullRaceAnalysis JSON (see `backend/app/domain/models.py`
and `frontend/types/index.ts`).
First load (no cache): 3–12 seconds. Cached: under 1 second.
Query: `force_refresh=true` recomputes from the cached raw endpoints.
A cached analysis from an older Chaos method (`chaos.method_version` missing or
≠ current) or an older schema is recomputed transparently and rewritten.
Includes `modules[<field>]` = `{status: ok|failed|not_applicable, reason}` for
every V4 field (see Errors).

### POST /chat
AI race engineer, grounded on the cached analysis (Ollama → Groq → offline text).
`/analysis/{session_key}` must have been called first.
Request: `{ "session_key": int, "question": str, "focused_driver": str | null }`
Headers: `X-Client-Id` — stable id per browser session; the rate limit is keyed on it.
Response: `{ "answer": str, "cited_signals": str[], "confidence": str }`
Rate limit: 10 messages / hour per `X-Client-Id`, 100 / hour per IP
(sliding window, in memory) → `429 RATE_LIMITED`.

### GET /chat/health
`{ ollama_reachable, base_url, model, model_available?, available_models?, groq_available, ai_ready, error?,
   active_provider, active_model, groq_model, groq_reasoning_effort }`
Always 200. `active_provider` / `active_model` are what the next /chat call would use, in
the same order as the fallback chain: Ollama (local, any pulled model) → Groq → offline.

**Production model:** Groq `openai/gpt-oss-120b`, `reasoning_effort=medium`
(`GROQ_MODEL`, `GROQ_REASONING_EFFORT` on Render; defaults in `config.py` and
`.env.example` are the same values). Local development uses Ollama
`llama3.1:8b` when it is pulled.

### GET /telemetry/{session_key}?drivers=NOR,VER,HAM&lap_mode=fastest_clean
Circuit telemetry replay (FastF1, precomputed on GitHub Actions; OpenF1 car_data
fallback in development). `drivers`: up to 5 codes. `lap_mode`:
`fastest_clean | representative`. Race sessions only. Returns TelemetryData
(`frontend/types/telemetry.ts`).

### POST /admin/clear-cache/{session_key}
Clears filesystem cache for a session. Dev only.

## Chaos Index — method 2.0

`chaos.method_version` says which formula produced `chaos.score`. **2.0 replaces
1.0** (event counts with per-component caps: SC×15, yellows×3, investigations×5,
penalties×4, rain periods×10, position changes÷5). Scores are not comparable
across versions: São Paulo 2024 (9636) was published as 100/100 under 1.0 and is
73/100 under 2.0.

Every component measures the **fraction of the race spent in an altered state**,
so race length does not change the score and a 1-lap safety car no longer equals
an 8-lap one:

```
score = Σ  weight_c · min(1, raw_c / full_scale_c)        (0–100)
```

| component | raw measurement | full scale (→ 1.0) | weight |
|---|---|---|---|
| `safety_car` | (SC laps + 0.5 · VSC laps) / total laps — a red flag counts as SC for its lap and the restart lap | 0.25 | 30 |
| `yellow_flags` | laps with a local (sector) yellow outside SC/VSC / total laps | 0.12 | 10 |
| `stewarding` | (incidents *noted* + 2 · penalties) / total laps — an incident is counted once when noted; "under investigation" / "no further investigation" are stages of it, not new incidents | 0.40 | 20 |
| `weather` | wet laps / total laps (rain periods per `weather_conditions`) | 0.75 | 20 |
| `position_volatility` | competitive place changes per driver-lap: ranks recomputed each lap among drivers who did not pit in the last 3 laps, on laps not under SC/VSC — pit-cycle and neutralisation shuffles are excluded | 0.12 | 20 |

`chaos.breakdown[<component>]` exposes `raw`, `raw_unit`, `normalized`,
`full_scale`, `weight`, `points` and a `note`; `chaos.components` keeps the
rounded points for the quick view.

Levels (`chaos.level`), on the 0–100 score: **Low < 15 · Medium 15–31 · High 32–54
· Extreme ≥ 55**. Full scales and levels were calibrated on the five cached
races (9566 Low 13 · 9539 Medium 24 · 9197 Medium 30 · 9662 High 35 · 9636
Extreme 73) so that no component saturates in more than one of them; they live
in `backend/app/services/chaos_service.py` and are mirrored in
`frontend/lib/chaos.ts`. Sprint sessions use the same formula: every term is
already per lap or per driver-lap, so a 24-lap sprint needs no separate
thresholds (not yet validated on a cached sprint — none is cached).

## Errors

Every non-2xx response, whatever raised it, has the same body:

```json
{"error": {"code": "UPPER_SNAKE", "message": "human-readable text", "details": {} | null}}
```

| code | status | emitted by |
|---|---|---|
| SESSION_NOT_CACHED | 404 | /analysis (demo mode, session not in cache); /races/{meeting}/sessions (needs token) |
| SESSION_NOT_HISTORICAL_YET | 425 | /analysis — details: `unlock_at_utc`, `retry_after_minutes` |
| OPENF1_RATE_LIMIT | 429 | /analysis, /races — details: `endpoint`, `attempts` |
| OPENF1_ERROR | 503 | /analysis, /races — details: `endpoint`, `attempts`, `upstream_status` when OpenF1 answered |
| OPENF1_UNAUTHORIZED | 503 | /analysis, /races — token configured but rejected by OpenF1 (without a token the same 401 is SESSION_NOT_CACHED) |
| RATE_LIMITED | 429 | /chat — details: `retry_after_seconds`, `scope` (session \| ip), `limit`, `window_seconds` |
| ANALYSIS_NOT_FOUND | 404 | /chat, /telemetry — run /analysis/{session_key} first |
| ANALYSIS_FAILED | 500 | /analysis — cached file unreadable (discarded; retry recomputes) or the computation itself crashed; /chat — cached analysis no longer matches the schema |
| TELEMETRY_RACE_ONLY | 400 | /telemetry — session is not a Race |
| TELEMETRY_NOT_PRECOMPUTED | 503 | /telemetry — production, no precomputed file |
| TELEMETRY_UNAVAILABLE | 404 | /telemetry — FastF1/OpenF1 returned nothing |
| VALIDATION_ERROR | 422 | any — details: `errors[]` (loc, msg, type) |
| NOT_FOUND / METHOD_NOT_ALLOWED | 404 / 405 | unmatched route |
| INTERNAL_ERROR | 500 | any uncaught exception — JSON, with CORS headers |

Partial failures inside /analysis do **not** produce an error: the response is
200 and `modules[<field>]` says `ok`, `failed` or `not_applicable` (with a
`reason`) for each V4 field (`drs_trains`, `crossover_windows`,
`weather_winners_losers`, `race_phases`, `race_dna`, `clean_air_value`,
`weather_analysis`).

## Demo sessions (cached in backend/cache/, served without an OpenF1 token)
session_key 9636 = Brazilian GP 2024 (primary demo)
session_key 9539 = Spanish GP 2024
session_key 9566 = Hungarian GP 2024
session_key 9197 = Abu Dhabi GP 2023
session_key 9662 = Abu Dhabi GP 2024