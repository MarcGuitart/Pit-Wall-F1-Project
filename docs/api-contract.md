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
Main endpoint. Returns FullRaceAnalysis JSON.
First load (no cache): 3–12 seconds.
Cached: under 1 second.

### POST /admin/clear-cache/{session_key}
Clears filesystem cache for a session. Dev only.

### POST /api/engineer-chat  (Next.js API route)
Calls Anthropic API with session context injected.
Request: { question, session_key, race_context }
Response: { answer }

## Errors

Every non-2xx response, whatever raised it, has the same body:

```json
{"error": {"code": "UPPER_SNAKE", "message": "human-readable text", "details": {} | null}}
```

| code | status | emitted by |
|---|---|---|
| SESSION_NOT_CACHED | 404 | /analysis (demo mode, session not in cache); /races/{meeting}/sessions (needs token) |
| SESSION_NOT_HISTORICAL_YET | 425 | /analysis — details: `unlock_at_utc`, `retry_after_minutes` |
| OPENF1_RATE_LIMIT | 429 | /analysis, /races — details: `endpoint` |
| OPENF1_ERROR | 503 | /analysis, /races — details: `endpoint`, `attempts` or `upstream_status` |
| OPENF1_UNAUTHORIZED | 503 | /analysis — token configured but rejected by OpenF1 (without a token the same 401 is SESSION_NOT_CACHED) |
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

## Demo sessions
session_key 9636 = Brazilian GP 2024 (primary demo)
session_key 9539 = Spanish GP 2024
session_key 9566 = Hungarian GP 2024
session_key 9617 = US GP Austin 2024 (has stop_duration)