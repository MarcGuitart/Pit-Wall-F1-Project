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
`{ ollama_reachable, base_url, model, model_available?, available_models?, groq_available, ai_ready, error? }`
Always 200.

### GET /telemetry/{session_key}?drivers=NOR,VER,HAM&lap_mode=fastest_clean
Circuit telemetry replay (FastF1, precomputed on GitHub Actions; OpenF1 car_data
fallback in development). `drivers`: up to 5 codes. `lap_mode`:
`fastest_clean | representative`. Race sessions only. Returns TelemetryData
(`frontend/types/telemetry.ts`).

### POST /admin/clear-cache/{session_key}
Clears filesystem cache for a session. Dev only.

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
| ANALYSIS_FAILED | 500 | /chat — cached analysis no longer matches the schema |
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