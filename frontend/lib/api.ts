import type { FullRaceAnalysis, RaceListItem, SessionInfo } from '@/types'
import type { TelemetryData } from '@/types/telemetry'
import { ApiError } from '@/lib/errors'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 0 },
    ...options,
  })
  if (!res.ok) {
    let detail: unknown
    try {
      detail = await res.json()
    } catch {
      detail = undefined
    }
    throw new ApiError(res.status, `API error ${res.status}: ${path}`, detail)
  }
  return res.json() as Promise<T>
}

export async function fetchRaces(year?: number): Promise<RaceListItem[]> {
  const query = year ? `?year=${year}` : ''
  return apiFetch<RaceListItem[]>(`/races${query}`)
}

export async function fetchSessions(
  meetingKey: number,
  signal?: AbortSignal,
): Promise<SessionInfo[]> {
  return apiFetch<SessionInfo[]>(`/races/${meetingKey}/sessions`, { signal })
}

export async function fetchAnalysis(sessionKey: number): Promise<FullRaceAnalysis> {
  return apiFetch<FullRaceAnalysis>(`/analysis/${sessionKey}`)
}

export async function fetchAnalysisForceRefresh(sessionKey: number): Promise<FullRaceAnalysis> {
  return apiFetch<FullRaceAnalysis>(`/analysis/${sessionKey}?force_refresh=true`)
}

export async function clearCache(sessionKey: number): Promise<{ cleared: boolean }> {
  const res = await fetch(`${BASE_URL}/admin/clear-cache/${sessionKey}`, {
    method: 'POST',
  })
  if (!res.ok) throw new ApiError(res.status, `Cache clear failed: ${res.status}`)
  return res.json()
}

export async function fetchChatHealth(): Promise<{
  ollama_reachable: boolean
  base_url: string
  model: string
  model_available?: boolean
  available_models?: string[]
  groq_available?: boolean
  ai_ready?: boolean
  error?: string
}> {
  const res = await fetch(`${BASE_URL}/chat/health`)
  if (!res.ok) {
    return { ollama_reachable: false, base_url: BASE_URL, model: 'unknown', error: `HTTP ${res.status}` }
  }
  return res.json()
}

/**
 * Send a question to the backend /chat endpoint (Ollama-backed).
 * The race context lives in the backend cache — only session_key is needed.
 */
export async function sendToEngineer(payload: {
  session_key: number
  question: string
  focused_driver?: string | null
}): Promise<{ answer: string; cited_signals?: string[]; confidence?: string }> {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new ApiError(res.status, `Chat error ${res.status}`)
  }
  return res.json()
}

/**
 * Legacy alias — kept for backward compat during migration.
 */
export async function engineerChat(payload: {
  question: string
  session_key: number
  race_context?: FullRaceAnalysis
  focused_driver?: string | null
}): Promise<{ answer: string }> {
  return sendToEngineer({
    session_key: payload.session_key,
    question: payload.question,
    focused_driver: payload.focused_driver,
  })
}

/**
 * Circuit telemetry (FastF1) — loaded lazily when the Circuit View is expanded.
 *
 * Returns:
 *   TelemetryData        — success
 *   null                 — generic failure
 *   'race_only'          — session is not a Race (Qualifying, Practice, etc.)
 *   'not_precomputed'    — session is a Race but telemetry hasn't been precomputed
 *   'production_unavailable' — legacy / unrecognised 503
 */
export async function getTelemetry(
  sessionKey: number,
  drivers: string[],
  lapMode: 'fastest_clean' | 'representative' = 'fastest_clean',
): Promise<TelemetryData | null | 'race_only' | 'not_precomputed' | 'production_unavailable'> {
  try {
    const res = await fetch(
      `${BASE_URL}/telemetry/${sessionKey}?drivers=${drivers.join(',')}&lap_mode=${lapMode}`,
    )
    if (res.status === 503) {
      try {
        const body = await res.json()
        if (body.error === 'telemetry_race_only') return 'race_only'
        if (body.error === 'telemetry_not_precomputed') return 'not_precomputed'
      } catch { /* fall through */ }
      return 'production_unavailable'
    }
    if (!res.ok) return null
    return (await res.json()) as TelemetryData
  } catch {
    return null
  }
}
