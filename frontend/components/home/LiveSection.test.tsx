// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

// Block 51: the landing's live card asks the live server only inside the live window.
const live = vi.hoisted(() => ({ fetchLivePublicState: vi.fn(async () => ({ state: 'no_session', sessionKey: null })) }))
vi.mock('@/lib/liveStatus', async (orig) => ({ ...(await orig<typeof import('@/lib/liveStatus')>()), ...live }))
const next = vi.hoisted(() => ({ value: null as null | { dateStart: string; dateEnd: string | null } }))
vi.mock('./NextSessionCard', async (orig) => ({
  ...(await orig<typeof import('./NextSessionCard')>()),
  loadNextSession: async () => (next.value ? { place: 'Austin', circuitShortName: 'Austin', sessionKey: 11400, sessionName: 'Race', ...next.value } : null),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/' }))

import { LiveSection } from './LiveSection'

const NOW = new Date('2026-10-24T12:00:00Z').getTime()
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(NOW); live.fetchLivePublicState.mockClear() })
afterEach(() => { cleanup(); vi.useRealTimers() })

const iso = (ms: number) => new Date(NOW + ms).toISOString()

describe('landing live card', () => {
  it('no session near: says so without asking the live server', async () => {
    next.value = { dateStart: iso(26 * 3600_000), dateEnd: iso(28 * 3600_000) }
    render(<LiveSection />)
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(live.fetchLivePublicState).not.toHaveBeenCalled()
  })

  it('a session starting in 20 min: asks the live server', async () => {
    next.value = { dateStart: iso(20 * 60_000), dateEnd: iso(140 * 60_000) }
    render(<LiveSection />)
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(live.fetchLivePublicState).toHaveBeenCalledTimes(1)
  })

  it('no calendar answer: does not wake the live server either', async () => {
    next.value = null
    render(<LiveSection />)
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(live.fetchLivePublicState).not.toHaveBeenCalled()
  })
})
