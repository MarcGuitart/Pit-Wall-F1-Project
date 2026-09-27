/**
 * PRO access on the browser side: hold the token, send it, know what it is worth.
 *
 * The token lives in localStorage and travels as an `Authorization: Bearer`
 * header. Not a cookie — the site is on pitwallengineer.com and the API is on
 * Render, so a cookie between them is a third-party cookie and Safari's ITP
 * blocks those outright. A cookie would have worked all through development and
 * failed silently for a large share of real visitors.
 *
 * Nothing here decides anything. The backend is the gate: every PRO request is
 * refused there with PRO_REQUIRED whatever this file believes. What this holds
 * is only enough to show the right thing without a round trip on every render.
 */
import { FIRST_SEASON, currentSeason } from '@/lib/seasons'

const TOKEN_KEY = 'pwiq_pro_token'
const EXPIRY_KEY = 'pwiq_pro_expires_at'

/** Seasons anyone may read. Mirrors FREE_SEASONS on the backend, which decides. */
export const FREE_SEASONS = [2023, 2024]

export const PRO_PRICE_LABEL = 'Races from 2025 and the current season with Live mode · €2.99/month'

export function isFreeSeason(year: number): boolean {
  return FREE_SEASONS.includes(year)
}

export function isProSeason(year: number): boolean {
  return !isFreeSeason(year)
}

/** The PRO seasons, newest first — the current year down to the last free one. */
export function proSeasons(): number[] {
  const years: number[] = []
  for (let y = currentSeason(); y >= FIRST_SEASON; y--) {
    if (isProSeason(y)) years.push(y)
  }
  return years
}

/** localStorage throws in a private window and in some embedded browsers. */
function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* a session that lasts until reload is better than a crash */
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/**
 * The stored token, or null. A token past its expiry is dropped here rather
 * than sent: the backend would refuse it anyway, and this way the UI does not
 * show PRO for a moment before the first refusal arrives.
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  const token = safeGet(TOKEN_KEY)
  if (!token) return null
  const expiresAt = Number(safeGet(EXPIRY_KEY) ?? 0)
  if (expiresAt && expiresAt * 1000 <= Date.now()) {
    clearToken()
    return null
  }
  return token
}

export function storeToken(token: string, expiresAt: number): void {
  safeSet(TOKEN_KEY, token)
  safeSet(EXPIRY_KEY, String(expiresAt))
}

export function clearToken(): void {
  safeRemove(TOKEN_KEY)
  safeRemove(EXPIRY_KEY)
}

export function hasToken(): boolean {
  return getToken() !== null
}

/** When the stored token runs out, or null if there is none. */
export function tokenExpiry(): Date | null {
  if (!getToken()) return null
  const expiresAt = Number(safeGet(EXPIRY_KEY) ?? 0)
  return expiresAt ? new Date(expiresAt * 1000) : null
}

/** The Authorization header for a request, or nothing when there is no token. */
export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Fired after a redeem or a sign-out so open components re-read the token. */
export const ACCESS_CHANGED_EVENT = 'pwiq:access-changed'

export function announceAccessChange(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT))
}
