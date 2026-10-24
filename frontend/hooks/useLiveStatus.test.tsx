// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

// The calendar goes through the real lib/liveStatus.ts; only its two API calls are counted here.
const api = vi.hoisted(() => ({ fetchRaces: vi.fn(), fetchSessions: vi.fn() }))
vi.mock('@/lib/api', () => api)

import { CALENDAR_TTL_MS, POLL_MS, __resetLiveStatusForTests, useLiveStatus } from './useLiveStatus'

const NOW = new Date('2026-10-24T12:00:00Z').getTime()
const MEETING = { meeting_key: 1297, meeting_name: 'United States Grand Prix', country_name: 'United States',
  circuit_short_name: 'Austin', location: 'Austin', date_start: '2026-10-23T16:30:00Z', year: 2026 }
const sessionAt = (key: number, iso: string) => ({ session_key: key, session_name: 'Race', session_type: 'Race', date_start: iso, date_end: null })

let live: { session_key: number | null } | 'down' = { session_key: null }
const health = vi.fn(async () => (live === 'down'
  ? Promise.reject(new Error('down'))
  : new Response(JSON.stringify({ status: 'ok', ...live }), { status: 200 })))

function setHidden(h: boolean) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') })
}

function Probe({ id }: { id: string }) {
  const s = useLiveStatus(true, 2026)
  return <span data-testid={id} data-live={String(s.liveSessionKey)} data-next={String(s.nextLive?.sessionKey ?? null)} />
}
const at = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  __resetLiveStatusForTests()
  setHidden(false)
  live = { session_key: null }
  health.mockClear()
  vi.stubGlobal('fetch', health)
  api.fetchRaces.mockReset().mockResolvedValue([MEETING])
  api.fetchSessions.mockReset().mockResolvedValue([sessionAt(11400, '2026-10-25T19:00:00Z')])
})
afterEach(() => { cleanup(); __resetLiveStatusForTests(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('useLiveStatus: capped polling', () => {
  it('two mounted components: at most one /races?year in 30 min, one /health per minute', async () => {
    const { getByTestId } = render(<><Probe id="top" /><Probe id="pro" /></>)
    await at(0)
    expect(getByTestId('top').dataset.next).toBe('11400')
    expect(getByTestId('pro').dataset.next).toBe('11400')
    await at(CALENDAR_TTL_MS - 1_000)
    expect(api.fetchRaces).toHaveBeenCalledTimes(1)
    expect(api.fetchSessions).toHaveBeenCalledTimes(1)
    expect(health.mock.calls.length).toBeLessThanOrEqual(30)        // one poller, not two
    await at(2 * POLL_MS)
    expect(api.fetchRaces).toHaveBeenCalledTimes(2)                 // the cache expired once
  })

  it('a remount in the same tab reuses the calendar it already has', async () => {
    const first = render(<Probe id="a" />)
    await at(0)
    first.unmount()
    render(<Probe id="b" />)
    await at(5 * POLL_MS)
    expect(api.fetchRaces).toHaveBeenCalledTimes(1)
  })

  it('no request at all while the tab is hidden; it asks again when shown', async () => {
    setHidden(true)
    render(<><Probe id="top" /><Probe id="pro" /></>)
    await at(10 * POLL_MS)
    expect(health).not.toHaveBeenCalled()
    expect(api.fetchRaces).not.toHaveBeenCalled()
    expect(api.fetchSessions).not.toHaveBeenCalled()
    setHidden(false)
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await at(0)
    expect(health).toHaveBeenCalledTimes(1)
    expect(api.fetchRaces).toHaveBeenCalledTimes(1)
  })

  it('with a session live on the live server, the calendar is never asked', async () => {
    live = { session_key: 11400 }
    const { getByTestId } = render(<><Probe id="top" /><Probe id="pro" /></>)
    await at(0)
    await at(30 * POLL_MS)
    expect(getByTestId('top').dataset.live).toBe('11400')
    expect(health.mock.calls.length).toBeGreaterThan(1)
    expect(api.fetchRaces).not.toHaveBeenCalled()
    expect(api.fetchSessions).not.toHaveBeenCalled()
  })

  it('the live server down: the calendar is asked, still capped', async () => {
    live = 'down'
    render(<Probe id="a" />)
    await at(10 * POLL_MS)
    expect(api.fetchRaces).toHaveBeenCalledTimes(1)
  })

  it('once the session it named has started, the calendar is asked again before 30 min', async () => {
    api.fetchSessions.mockResolvedValue([sessionAt(11399, new Date(NOW + 3 * POLL_MS).toISOString())])
    render(<Probe id="a" />)
    await at(0)
    expect(api.fetchRaces).toHaveBeenCalledTimes(1)
    await at(4 * POLL_MS)
    expect(api.fetchRaces).toHaveBeenCalledTimes(2)
    await at(20 * POLL_MS)                                         // still named (no end yet): not every minute
    expect(api.fetchRaces).toHaveBeenCalledTimes(2)
  })

  it('not PRO: nothing is asked', async () => {
    function NotPro() { useLiveStatus(false, 2026); return null }
    render(<NotPro />)
    await at(10 * POLL_MS)
    expect(health).not.toHaveBeenCalled()
    expect(api.fetchRaces).not.toHaveBeenCalled()
  })
})
