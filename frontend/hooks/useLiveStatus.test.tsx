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
let liveState: 'live' | 'no_session' = 'no_session'
// The live server: /health (counted in `health`) and /live/state (counted in `stateCalls`).
const stateCalls = vi.fn()
const health = vi.fn()
const liveServer = vi.fn(async (url: string) => {
  if (String(url).endsWith('/live/state')) {
    stateCalls(url)
    return new Response(JSON.stringify({ state: liveState, session_key: liveState === 'live' ? 11400 : null }), { status: 200 })
  }
  health(url)
  return live === 'down' ? Promise.reject(new Error('down')) : new Response(JSON.stringify({ status: 'ok', ...live }), { status: 200 })
})

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
  health.mockClear(); stateCalls.mockClear(); liveServer.mockClear(); liveState = 'no_session'
  vi.stubGlobal('fetch', liveServer)
  api.fetchRaces.mockReset().mockResolvedValue([MEETING])
  api.fetchSessions.mockReset().mockResolvedValue([sessionAt(11400, '2026-10-25T19:00:00Z')])
})
afterEach(() => { cleanup(); __resetLiveStatusForTests(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('useLiveStatus: capped polling', () => {
  it('two mounted components: one calendar request in 6 h, and the live server never asked with no session near', async () => {
    const { getByTestId } = render(<><Probe id="top" /><Probe id="pro" /></>)
    await at(0)
    expect(getByTestId('top').dataset.next).toBe('11400')
    expect(getByTestId('pro').dataset.next).toBe('11400')
    await at(CALENDAR_TTL_MS - 1_000)
    expect(api.fetchRaces).toHaveBeenCalledTimes(1)
    expect(api.fetchSessions).toHaveBeenCalledTimes(1)
    expect(health).not.toHaveBeenCalled()                           // next session is 31 h away
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
    expect(api.fetchRaces).toHaveBeenCalledTimes(1)
    expect(health).not.toHaveBeenCalled()                           // no session near
  })

  it('a session starting in 20 min: the live server is asked once a minute, by one poller', async () => {
    api.fetchSessions.mockResolvedValue([sessionAt(11400, new Date(NOW + 20 * 60_000).toISOString())])
    live = { session_key: 11400 }
    const { getByTestId } = render(<><Probe id="top" /><Probe id="pro" /></>)
    await at(0)
    expect(getByTestId('top').dataset.live).toBe('11400')
    await at(10 * POLL_MS)
    expect(health.mock.calls.length).toBe(11)                       // at mount, then every minute
    expect(api.fetchRaces).toHaveBeenCalledTimes(1)
  })

  it('31 min before the start the live server is not asked yet; at 30 min it is', async () => {
    api.fetchSessions.mockResolvedValue([sessionAt(11400, new Date(NOW + 31 * 60_000).toISOString())])
    render(<Probe id="a" />)
    await at(0)
    expect(health).not.toHaveBeenCalled()
    await at(POLL_MS)
    expect(health).toHaveBeenCalledTimes(1)
  })

  it('past the scheduled end: /live/state while it says live, then the session is over and the calendar moves on', async () => {
    const s1 = { ...sessionAt(11400, new Date(NOW - 2 * 3600_000).toISOString()), date_end: new Date(NOW - 60_000).toISOString() }
    const s2 = sessionAt(11401, new Date(NOW + 48 * 3600_000).toISOString())
    api.fetchSessions.mockResolvedValue([s1, s2])
    liveState = 'live'                                                // red flags: still running 1 min after its end
    const { getByTestId } = render(<Probe id="a" />)
    await at(0)
    expect(getByTestId('a').dataset.live).toBe('11400')
    expect(health).not.toHaveBeenCalled()                             // past the end it asks /live/state, not /health
    await at(5 * POLL_MS)
    expect(stateCalls.mock.calls.length).toBe(6)
    liveState = 'no_session'                                          // the session ends
    await at(POLL_MS)
    expect(getByTestId('a').dataset.live).toBe('null')
    const races = api.fetchRaces.mock.calls.length
    await at(POLL_MS)
    expect(api.fetchRaces.mock.calls.length).toBe(races + 1)          // the calendar is asked again, without 11400
    expect(getByTestId('a').dataset.next).toBe('11401')
    const asked = stateCalls.mock.calls.length + health.mock.calls.length
    await at(30 * POLL_MS)
    expect(stateCalls.mock.calls.length + health.mock.calls.length).toBe(asked)   // 11401 is two days away
  })

  it('90 minutes after the scheduled end it stops asking even if /live/state still says live', async () => {
    const s1 = { ...sessionAt(11400, new Date(NOW - 2 * 3600_000).toISOString()), date_end: new Date(NOW - 80 * 60_000).toISOString() }
    api.fetchSessions.mockResolvedValue([s1])
    liveState = 'live'
    render(<Probe id="a" />)
    await at(0)
    await at(9 * POLL_MS)                                             // up to 89 min after the end
    const asked = stateCalls.mock.calls.length
    expect(asked).toBeGreaterThan(5)
    await at(30 * POLL_MS)
    expect(stateCalls.mock.calls.length).toBeLessThanOrEqual(asked + 1)
  })

  it('the live server down: the calendar is asked, still capped', async () => {
    live = 'down'
    render(<Probe id="a" />)
    await at(10 * POLL_MS)
    expect(api.fetchRaces).toHaveBeenCalledTimes(1)
  })

  it('once the session it named has started, the calendar is asked again before the 6 h', async () => {
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
