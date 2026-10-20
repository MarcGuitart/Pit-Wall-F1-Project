// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { FullRaceAnalysis, SessionMeta } from '@/types'
import { ApiError } from '@/lib/errors'

// Block 27: the race page's flow — loader, arrival, and the pages with no
// analysis — against the API contract of ops/loading-meta (fixtures, no server).
let key = 0
vi.mock('next/navigation', () => ({ useParams: () => ({ sessionKey: String(key) }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))
vi.mock('@/components/layout/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/analysis/AnalysisPage', () => ({
  AnalysisPage: ({ arriving }: { arriving?: boolean }) => <div data-testid="analysis" data-arriving={String(Boolean(arriving))}>analysis</div>,
}))
vi.mock('@/lib/liveStatus', () => ({ fetchLiveServerStatus: vi.fn(async () => ({ reachable: false, sessionKey: null })) }))

const api = vi.hoisted(() => ({
  fetchAnalysis: vi.fn(),
  fetchSessionMeta: vi.fn(),
  redeemAccessCode: vi.fn(),
}))
vi.mock('@/lib/api', () => api)

import RacePage from './page'
import { resetLoadClock } from '@/lib/loadPhase'
import { __resetSessionMetaForTests } from '@/lib/sessionMeta'
import { useRaceStore } from '@/stores/raceStore'

const meta = (k: number, extra: Partial<SessionMeta> = {}): SessionMeta => ({
  session_key: k, meeting_key: 1283, meeting_name: 'Saudi Arabian Grand Prix', location: 'Jeddah',
  circuit_short_name: 'Jeddah', country_name: 'Saudi Arabia', year: 2026, session_name: 'Race', session_type: 'Race',
  date_start: '2026-04-19T17:00:00+00:00', date_end: '2026-04-19T19:00:00+00:00', is_cancelled: false,
  analysis_cached: false, earliest_at: '2026-04-19T19:30:00+00:00', ...extra,
})
const analysisFor = (k: number) => ({ race: { session_key: k, meeting_name: 'X', year: 2024, session_name: 'Race' } }) as unknown as FullRaceAnalysis
const never = () => new Promise(() => {})
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const at = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); await Promise.resolve() })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'))
  __resetSessionMetaForTests()
  useRaceStore.getState().clearAnalysis()
  Object.values(api).forEach((f) => f.mockReset())
})
afterEach(() => { cleanup(); vi.useRealTimers(); resetLoadClock(key) })

function open(k: number) {
  key = k
  resetLoadClock(k)
  return render(<RacePage />)
}

describe('pages with no analysis', () => {
  it('cancelled, from the meta, without waiting for /analysis — and no Retry', async () => {
    api.fetchAnalysis.mockImplementation(never)
    api.fetchSessionMeta.mockResolvedValue(meta(27001, { is_cancelled: true }))
    open(27001)
    await flush()
    expect(screen.getByText('This session did not take place')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to race list' })).toBeTruthy()
  })

  it('cancelled, from SESSION_CANCELLED', async () => {
    api.fetchAnalysis.mockRejectedValue(new ApiError(410, 'SESSION_CANCELLED', 'cancelled', { source: 'excluded_sessions.json' }))
    api.fetchSessionMeta.mockResolvedValue(meta(27002))
    open(27002)
    await flush()
    expect(screen.getByText('Session cancelled')).toBeTruthy()
  })

  it('not found, from the meta 404', async () => {
    api.fetchAnalysis.mockImplementation(never)
    api.fetchSessionMeta.mockRejectedValue(new ApiError(404, 'SESSION_NOT_FOUND', 'no such session'))
    open(27003)
    await flush()
    expect(screen.getByText('No race at this address')).toBeTruthy()
  })

  it('not published yet: earliest possible, an .ics labelled earliest, no promised hour', async () => {
    api.fetchAnalysis.mockRejectedValue(new ApiError(425, 'SESSION_NOT_HISTORICAL_YET', 'live window', { unlock_at_utc: '2026-04-19T19:30:00+00:00', retry_after_minutes: 30 }))
    api.fetchSessionMeta.mockResolvedValue(meta(27004))
    open(27004)
    await flush()
    expect(screen.getByText('Earliest possible')).toBeTruthy()
    expect(screen.getByText('Sun 19 Apr 2026 · 19:30 UTC')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^add to calendar: .*\(earliest\)$/i })).toBeTruthy()
    expect(document.body.textContent).toMatch(/normally within a few hours of the chequered flag/)
  })

  it('PRO required: one field, one action; a wrong code is one line under it', async () => {
    api.fetchAnalysis.mockRejectedValue(new ApiError(402, 'PRO_REQUIRED', 'pro', { year: 2026 }))
    api.fetchSessionMeta.mockResolvedValue(meta(27005))
    api.redeemAccessCode.mockRejectedValue(new ApiError(401, 'INVALID_ACCESS_CODE', 'nope'))
    open(27005)
    await flush()
    fireEvent.change(screen.getByLabelText('Access code'), { target: { value: 'BAD-CODE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await flush()
    expect(screen.getByText('That code is not valid.')).toBeTruthy()
  })

  it('rate limited: a countdown from retry_after_seconds; Retry unlocks at 0', async () => {
    api.fetchAnalysis.mockRejectedValueOnce(new ApiError(429, 'OPENF1_RATE_LIMIT', 'slow down', { retry_after_seconds: 3 }))
    api.fetchAnalysis.mockImplementation(never)
    api.fetchSessionMeta.mockResolvedValue(meta(27006))
    open(27006)
    await flush()
    const retry = screen.getByRole('button', { name: 'Retry' }) as HTMLButtonElement
    expect(screen.getByText('3 s')).toBeTruthy()
    expect(retry.disabled).toBe(true)
    await at(3_000)
    expect((screen.getByRole('button', { name: 'Retry' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await flush()
    expect(api.fetchAnalysis).toHaveBeenCalledTimes(2)
  })
})

describe('loader → page', () => {
  it('an answer at 350 ms holds the loader to 600 ms, then crossfades for 400 ms', async () => {
    let resolve!: (v: FullRaceAnalysis) => void
    api.fetchAnalysis.mockImplementation(() => new Promise((r) => { resolve = r }))
    api.fetchSessionMeta.mockResolvedValue(meta(27007))
    const { container } = open(27007)
    await flush()
    await at(350)
    await act(async () => { resolve(analysisFor(27007)) })
    await flush()
    expect(screen.queryByTestId('analysis')).toBeNull()
    expect(container.querySelector('[data-state="loading"]')).toBeTruthy()
    await at(250)
    expect(screen.getByTestId('analysis').getAttribute('data-arriving')).toBe('true')
    expect(container.querySelector('[data-skeleton="leaving"]')).toBeTruthy()
    await at(400)
    expect(screen.getByTestId('analysis').getAttribute('data-arriving')).toBe('false')
    expect(container.querySelector('[data-skeleton]')).toBeNull()
  })

  it('a warm answer (< 300 ms) shows the page with no loader and no arrival', async () => {
    api.fetchAnalysis.mockResolvedValue(analysisFor(27008))
    api.fetchSessionMeta.mockResolvedValue(meta(27008))
    const { container } = open(27008)
    await flush()
    expect(screen.getByTestId('analysis').getAttribute('data-arriving')).toBe('false')
    expect(container.querySelector('[data-skeleton]')).toBeNull()
  })

  it('aborted at 45 s: state 4 in the loader; Retry asks again', async () => {
    api.fetchAnalysis.mockImplementation((_k: number, signal?: AbortSignal) => new Promise((_r, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    api.fetchSessionMeta.mockResolvedValue(meta(27009))
    const { container } = open(27009)
    await flush()
    await at(45_000)
    await flush()
    expect(container.querySelector('[data-state="error"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await flush()
    expect(api.fetchAnalysis).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[data-state="error"]')).toBeNull()
  })
})
