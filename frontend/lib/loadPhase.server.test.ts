// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadStartedAt, phaseAt } from './loadPhase'

// Block 31 (preflight, C1): on the server there is no window, and a module-level
// map would be shared by every request the Next server handles. Two readers
// opening the same race 20 s apart must not share a clock: the second one was
// server-rendered as "Waking up the analysis server, 00:20", which also broke
// hydration (React #418/#422) when the browser rendered its own fresh clock.
afterEach(() => vi.useRealTimers())

describe('loadStartedAt on the server', () => {
  it('is always "now" and remembers nothing between requests', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'))
    const first = loadStartedAt(9636)
    vi.advanceTimersByTime(20_000)
    const second = loadStartedAt(9636)
    expect(second - first).toBe(20_000)
    expect(phaseAt(Date.now() - second)).toBe('hidden')
  })
})
