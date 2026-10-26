// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { arrivalPlan, useArrival } from './arrival'
import { ARRIVAL_MS, ruleTargetAt, progressAt } from './loadPhase'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T12:00:00Z')) })
afterEach(() => vi.useRealTimers())

describe('arrivalPlan', () => {
  it('an answer inside 300 ms never showed a loader: no arrival, no hold', () => {
    expect(arrivalPlan(0, 299)).toEqual({ animate: false, holdMs: 0 })
  })
  it('a loader that appeared at 300 ms stays up at least 300 ms: an answer at 350 ms waits 250 ms', () => {
    expect(arrivalPlan(0, 350)).toEqual({ animate: true, holdMs: 250 })
  })
  it('a loader up long enough crossfades at once', () => {
    expect(arrivalPlan(0, 5_000)).toEqual({ animate: true, holdMs: 0 })
  })
})

describe('useArrival', () => {
  it('loading → hold → arriving → done, on the timers', () => {
    const start = Date.now()
    const { result, rerender } = renderHook(({ ready }) => useArrival(start, ready), { initialProps: { ready: false } })
    expect(result.current).toBe('loading')
    act(() => { vi.advanceTimersByTime(350) })
    rerender({ ready: true })
    expect(result.current).toBe('hold')
    act(() => { vi.advanceTimersByTime(249) })
    expect(result.current).toBe('hold')
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).toBe('arriving')
    act(() => { vi.advanceTimersByTime(ARRIVAL_MS) })
    expect(result.current).toBe('done')
  })

  it('a warm cache goes straight to the page', () => {
    const start = Date.now()
    const { result, rerender } = renderHook(({ ready }) => useArrival(start, ready), { initialProps: { ready: false } })
    act(() => { vi.advanceTimersByTime(120) })
    rerender({ ready: true })
    expect(result.current).toBe('done')
  })

  it('data already in when the page mounts: no loader, no arrival', () => {
    const { result } = renderHook(() => useArrival(Date.now(), true))
    expect(result.current).toBe('done')
  })
})

describe('ruleTargetAt', () => {
  it('targets the next second (1 s linear transition), capped below 0.94', () => {
    expect(ruleTargetAt(3_200)).toBeCloseTo(progressAt(4_000))
    expect(ruleTargetAt(600_000)).toBeLessThanOrEqual(0.94)
    expect(ruleTargetAt(600_000)).toBeLessThan(1)
  })
  it('reduced motion: 2 s steps', () => {
    expect(ruleTargetAt(3_900, true)).toBeCloseTo(progressAt(2_000))
    expect(ruleTargetAt(4_000, true)).toBeCloseTo(progressAt(4_000))
  })
})
