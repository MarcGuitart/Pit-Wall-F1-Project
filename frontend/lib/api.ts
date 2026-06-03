import type { FullRaceAnalysis, RaceListItem, SessionInfo } from '@/types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 0 },
  })
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${path}`)
  }
  return res.json() as Promise<T>
}

export async function fetchRaces(year?: number): Promise<RaceListItem[]> {
  const query = year ? `?year=${year}` : ''
  return apiFetch<RaceListItem[]>(`/races${query}`)
}

export async function fetchSessions(meetingKey: number): Promise<SessionInfo[]> {
  return apiFetch<SessionInfo[]>(`/races/${meetingKey}/sessions`)
}

export async function fetchAnalysis(sessionKey: number): Promise<FullRaceAnalysis> {
  return apiFetch<FullRaceAnalysis>(`/analysis/${sessionKey}`)
}

export async function clearCache(sessionKey: number): Promise<{ cleared: boolean }> {
  const res = await fetch(`${BASE_URL}/admin/clear-cache/${sessionKey}`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(`Cache clear failed: ${res.status}`)
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
    // Graceful degradation: return a friendly error message
    throw new Error(`Chat error ${res.status}`)
  }
  return res.json()
}

/**
 * Legacy alias — kept for backward compat during migration.
 * Calls backend /chat directly (no longer uses Anthropic API via Next.js).
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
