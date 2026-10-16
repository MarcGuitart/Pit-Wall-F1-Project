// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  SHOW_AFTER_MS, WAKING_AFTER_MS, TIMEOUT_AFTER_MS,
  phaseAt, progressAt, useLoadPhase, loadStartedAt, resetLoadClock,
} from './loadPhase'

describe('phaseAt — the brief\'s boundaries', () => {
  it('shows nothing under 300 ms, loads to 8 s, wakes to 45 s, then times out', () => {
    expect(phaseAt(0)).toBe('hidden')
    expect(phaseAt(299)).toBe('hidden')
    expect(phaseAt(300)).toBe('loading')
    expect(phaseAt(7_999)).toBe('loading')
    expect(phaseAt(8_000)).toBe('waking')
    expect(phaseAt(44_999)).toBe('waking')
    expect(phaseAt(45_000)).toBe('timeout')
    expect([SHOW_AFTER_MS, WAKING_AFTER_MS, TIMEOUT_AFTER_MS]).toEqual([300, 8_000, 45_000])
  })
})

describe('progressAt — time-based, never complete', () => {
  it('rises monotonically and stays below 0.94 however long the wait', () => {
    let last = -1
    for (const t of [0, 300, 1_000, 3_200, 8_000, 17_000, 45_000, 600_000, 1e9]) {
      const p = progressAt(t)
      expect(p).toBeGreaterThanOrEqual(last)
      expect(p).toBeLessThan(0.94 + 1e-12)
      last = p
    }
    expect(progressAt(1e9)).toBeLessThan(1)
  })
})

describe('useLoadPhase with fake timers', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T12:00:00Z')) })
  afterEach(() => vi.useRealTimers())

  it('steps through hidden → loading → waking → timeout on its own timers', () => {
    const start = Date.now()
    const { result } = renderHook(() => useLoadPhase(start))
    expect(result.current.phase).toBe('hidden')
    act(() => { vi.advanceTimersByTime(299) })
    expect(result.current.phase).toBe('hidden')
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.phase).toBe('loading')
    act(() => { vi.advanceTimersByTime(WAKING_AFTER_MS - SHOW_AFTER_MS) })
    expect(result.current.phase).toBe('waking')
    act(() => { vi.advanceTimersByTime(TIMEOUT_AFTER_MS - WAKING_AFTER_MS) })
    expect(result.current.phase).toBe('timeout')
  })

  it('a load that started earlier (in loading.tsx) resumes where it was', () => {
    const start = Date.now() - 9_000
    const { result } = renderHook(() => useLoadPhase(start))
    expect(result.current.phase).toBe('waking')
    expect(result.current.elapsedMs).toBe(9_000)
  })
})

describe('the shared load clock', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T12:00:00Z')) })
  afterEach(() => vi.useRealTimers())

  it('gives every reader of one session the same start, until reset', () => {
    const a = loadStartedAt(9636)
    vi.advanceTimersByTime(2_000)
    expect(loadStartedAt(9636)).toBe(a)
    resetLoadClock(9636)
    expect(loadStartedAt(9636)).toBe(a + 2_000)
    resetLoadClock(9636)
  })
})
