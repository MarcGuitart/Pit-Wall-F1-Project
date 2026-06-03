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

## Demo sessions
session_key 9636 = Brazilian GP 2024 (primary demo)
session_key 9539 = Spanish GP 2024
session_key 9566 = Hungarian GP 2024
session_key 9617 = US GP Austin 2024 (has stop_duration)