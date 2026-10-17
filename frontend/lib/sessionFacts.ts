import type { SessionMeta } from '@/types'
import { placeOf } from '@/lib/place'

/**
 * The race header's facts — the same strings in the loader, the blocked pages
 * and the analysis page once it arrives, so arrival swaps nothing in the
 * header (Block 27). The place is the city (location) and not OpenF1's
 * country, which is wrong for at least one 2026 meeting.
 */
export type HeaderFacts = { kicker: string; title: string | null; line: string | null }

export function formatSessionDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function headerFacts(sessionKey: number, meta: SessionMeta | null): HeaderFacts {
  const kicker = `Race analysis · OpenF1 · Session ${sessionKey}`
  if (!meta) return { kicker, title: null, line: null }
  // The place is the headline (Block 27b); the line carries the rest.
  const parts = [meta.year != null ? String(meta.year) : null, meta.session_name, formatSessionDate(meta.date_start)]
  const line = parts.filter(Boolean).join(' · ') || null
  return { kicker, title: placeOf(meta), line }
}

/** "Sun 01 Jun 2025 · 19:00 UTC" — the blocked pages' times, in UTC like the spec. */
export function formatUtcInstant(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(',', '')
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  return `${day} · ${time} UTC`
}

/** The race page's breadcrumb, from the facts — so the loader's top bar is the
 *  page's top bar (on mobile the breadcrumb is its own 36 px row: without it
 *  here, arrival pushed the whole page down). */
export function raceBreadcrumb(meta: SessionMeta | null): { label: string; href?: string }[] | undefined {
  if (!meta || meta.year == null || !meta.session_name) return undefined
  return [
    { label: String(meta.year), href: '/races' },
    { label: placeOf(meta), href: '/races' },
    { label: meta.session_name },
  ]
}
