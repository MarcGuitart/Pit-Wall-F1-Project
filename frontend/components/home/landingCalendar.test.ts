// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Block 51: the landing's one calendar request keeps a session through its live tail; the hero card skips it.
const ls = vi.hoisted(() => ({ fetchNextLiveSession: vi.fn() }))
vi.mock('@/lib/liveStatus', async (orig) => ({ ...(await orig<typeof import('@/lib/liveStatus')>()), ...ls }))
vi.mock('@/lib/seasons', async (orig) => ({ ...(await orig<typeof import('@/lib/seasons')>()), currentSeason: () => 2026 }))

const NOW = Date.parse('2026-10-25T21:30:00Z')
const ended = { place: 'Austin', circuitShortName: 'Austin', sessionKey: 11396, sessionName: 'Race', dateStart: '2026-10-25T19:00:00Z', dateEnd: '2026-10-25T21:00:00Z' }
const following = { ...ended, place: 'Mexico City', sessionKey: 11400, dateStart: '2026-10-30T18:30:00Z', dateEnd: '2026-10-30T19:30:00Z' }

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.resetModules(); ls.fetchNextLiveSession.mockReset() })
afterEach(() => vi.useRealTimers())

describe('landing calendar', () => {
  it('one request with the 90 min tail serves both cards; the hero card asks once more only during a tail', async () => {
    ls.fetchNextLiveSession.mockImplementation(async (_y: number, _n: Date, grace = 0, skip = new Set()) =>
      grace > 0 && !skip.has(11396) ? ended : following)
    const m = await import('./NextSessionCard')
    expect((await m.loadCalendarWithTail())?.sessionKey).toBe(11396)       // still in its tail: the live card asks /live/state
    expect((await m.loadNextSession())?.sessionKey).toBe(11400)            // the hero card shows the one after it
    expect(ls.fetchNextLiveSession).toHaveBeenCalledTimes(2)
    expect(ls.fetchNextLiveSession.mock.calls[0][2]).toBe(90 * 60_000)
    expect([...ls.fetchNextLiveSession.mock.calls[1][3]]).toEqual([11396])
  })

  it('no session in its tail: one request, the same answer for both cards', async () => {
    ls.fetchNextLiveSession.mockResolvedValue(following)
    const m = await import('./NextSessionCard')
    expect((await m.loadCalendarWithTail())?.sessionKey).toBe(11400)
    expect((await m.loadNextSession())?.sessionKey).toBe(11400)
    expect(ls.fetchNextLiveSession).toHaveBeenCalledTimes(1)
  })
})
