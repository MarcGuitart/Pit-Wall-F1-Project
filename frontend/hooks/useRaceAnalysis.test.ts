// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useRaceStore } from '@/stores/raceStore'
import { resetLoadClock } from '@/lib/loadPhase'
import type { FullRaceAnalysis } from '@/types'

const fetchAnalysis = vi.fn()
vi.mock('@/lib/api', () => ({ fetchAnalysis: (...a: unknown[]) => fetchAnalysis(...a) }))

import { useRaceAnalysis } from './useRaceAnalysis'

const analysis = (key: number) => ({ race: { session_key: key } }) as unknown as FullRaceAnalysis

/** A fetch that answers after `ms`, or never, and rejects like fetch does when aborted. */
function answerAfter(ms: number | null, key = 9636) {
  return (_k: number, signal: AbortSignal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    if (ms != null) setTimeout(() => resolve(analysis(key)), ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'))
  fetchAnalysis.mockReset()
  useRaceStore.getState().clearAnalysis()
  resetLoadClock(9636)
})
afterEach(() => vi.useRealTimers())

describe('useRaceAnalysis', () => {
  it('delivers the analysis as soon as it arrives — no artificial delay', async () => {
    fetchAnalysis.mockImplementation(answerAfter(150))
    const { result } = renderHook(() => useRaceAnalysis(9636))
    expect(result.current.loading).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    expect(result.current.data?.race.session_key).toBe(9636)
    expect(result.current.loading).toBe(false)
  })

  it('aborts at 45 s and reports a timeout the page can retry', async () => {
    fetchAnalysis.mockImplementation(answerAfter(null))
    const { result } = renderHook(() => useRaceAnalysis(9636))
    const signal = fetchAnalysis.mock.calls[0][1] as AbortSignal
    await act(async () => { await vi.advanceTimersByTimeAsync(44_999) })
    expect(signal.aborted).toBe(false)
    expect(result.current.error).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(signal.aborted).toBe(true)
    expect(result.current.error?.code).toBe('ANALYSIS_TIMEOUT')
    expect(result.current.loading).toBe(false)
  })

  it('retries with a fresh request and a fresh 45 s budget', async () => {
    fetchAnalysis.mockImplementationOnce(answerAfter(null)).mockImplementationOnce(answerAfter(5_000))
    const { result } = renderHook(() => useRaceAnalysis(9636))
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000) })
    expect(result.current.error?.code).toBe('ANALYSIS_TIMEOUT')
    await act(async () => { result.current.retry() })
    expect(fetchAnalysis).toHaveBeenCalledTimes(2)
    const second = fetchAnalysis.mock.calls[1][1] as AbortSignal
    expect(second.aborted).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(result.current.error).toBeNull()
    expect(result.current.data?.race.session_key).toBe(9636)
  })

  it('never has two requests in flight for one session (double mount)', () => {
    fetchAnalysis.mockImplementation(answerAfter(null))
    renderHook(() => useRaceAnalysis(9636))
    renderHook(() => useRaceAnalysis(9636))
    expect(fetchAnalysis).toHaveBeenCalledTimes(1)
  })
})
