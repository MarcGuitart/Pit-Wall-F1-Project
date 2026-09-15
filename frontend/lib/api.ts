import type { FullRaceAnalysis, RaceListItem, SessionInfo } from '@/types'
import type { TelemetryData } from '@/types/telemetry'
import { ApiError, type ErrorDetails } from '@/lib/errors'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export type UnwrappedError = { code: string; message: string; details: ErrorDetails | null }

const STATUS_FALLBACK_CODE: Record<number, string> = {
  404: 'NOT_FOUND',
  422: 'VALIDATION_ERROR',
  425: 'SESSION_NOT_HISTORICAL_YET',
  429: 'OPENF1_RATE_LIMIT',
  500: 'INTERNAL_ERROR',
  503: 'OPENF1_ERROR',
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Normalise any error body the backend has ever produced into {code, message, details}.
 *
 * Accepted shapes:
 *   { error: { code, message, details } }      — current envelope (AppError handler)
 *   { detail: "text" }                          — legacy HTTPException(str)
 *   { detail: { code, message, ...extra } }     — legacy HTTPException(dict)
 *   { detail: [ { loc, msg, type } ] }          — legacy FastAPI 422
 *   { error: "snake_code", message }            — legacy telemetry JSONResponse
 *   anything else / non-JSON                    — code derived from the HTTP status
 */
export function unwrapError(status: number, body: unknown): UnwrappedError {
  const fallbackCode = STATUS_FALLBACK_CODE[status] ?? `HTTP_${status}`
  const fallbackMessage = `HTTP ${status}`

  if (isRecord(body)) {
    // Current envelope
    if (isRecord(body.error)) {
      const e = body.error
      return {
        code: typeof e.code === 'string' ? e.code : fallbackCode,
        message: typeof e.message === 'string' ? e.message : fallbackMessage,
        details: isRecord(e.details) ? e.details : null,
      }
    }
    // Legacy telemetry: { error: "telemetry_race_only", message }
    if (typeof body.error === 'string') {
      return {
        code: body.error.toUpperCase(),
        message: typeof body.message === 'string' ? body.message : fallbackMessage,
        details: null,
      }
    }
    if ('detail' in body) {
      const d = body.detail
      if (typeof d === 'string') {
        return { code: fallbackCode, message: d, details: null }
      }
      if (Array.isArray(d)) {
        const msgs = d
          .map((item) => (isRecord(item) && typeof item.msg === 'string' ? `${(item.loc as unknown[] | undefined)?.join('.') ?? ''}: ${item.msg}` : null))
          .filter((m): m is string => m !== null)
        return {
          code: 'VALIDATION_ERROR',
          message: msgs.length ? msgs.join('; ') : 'Invalid request.',
          details: { errors: d },
        }
      }
      if (isRecord(d)) {
        const { code, message, ...rest } = d
        return {
          code: typeof code === 'string' ? code.toUpperCase() : fallbackCode,
          message: typeof message === 'string' ? message : fallbackMessage,
          details: Object.keys(rest).length ? rest : null,
        }
      }
    }
  }

  return { code: fallbackCode, message: fallbackMessage, details: null }
}

async function readBody(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return undefined
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 0 },
    ...options,
  })
  if (!res.ok) {
    const { code, message, details } = unwrapError(res.status, await readBody(res))
    throw new ApiError(res.status, code, message, details)
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
  return apiFetch<{ cleared: boolean }>(`/admin/clear-cache/${sessionKey}`, { method: 'POST' })
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
  try {
    return await apiFetch(`/chat/health`)
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Backend unreachable'
    return { ollama_reachable: false, base_url: BASE_URL, model: 'unknown', error: message }
  }
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
  return apiFetch(`/chat`, { method: 'POST', body: JSON.stringify(payload) })
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
    return await apiFetch<TelemetryData>(
      `/telemetry/${sessionKey}?drivers=${drivers.join(',')}&lap_mode=${lapMode}`,
    )
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 'TELEMETRY_RACE_ONLY') return 'race_only'
      if (err.code === 'TELEMETRY_NOT_PRECOMPUTED') return 'not_precomputed'
      if (err.status === 503) return 'production_unavailable'
    }
    return null
  }
}
