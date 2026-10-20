// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { RadioTrigger } from './RadioTrigger'

/**
 * The engineer button's waveform moves by transform only (Block 31, C4: the
 * perf check allows animating transform and opacity, nothing that lays out).
 */

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function bars() {
  const wave = screen.getByRole('button').querySelector('[aria-hidden="true"]')!
  return Array.from(wave.children) as HTMLElement[]
}

describe('RadioTrigger waveform', () => {
  it('scales full-height bars instead of setting their height', () => {
    vi.useFakeTimers()
    render(<RadioTrigger />)
    const before = bars().map((b) => b.style.transform)
    act(() => { vi.advanceTimersByTime(900) })
    const after = bars()
    expect(after).toHaveLength(9)
    for (const b of after) {
      expect(b.style.height).toBe('')
      const m = /^scaleY\(([\d.]+)\)$/.exec(b.style.transform)
      expect(m).not.toBeNull()
      const k = Number(m![1])
      expect(k).toBeGreaterThan(0)
      expect(k).toBeLessThanOrEqual(1)
    }
    expect(after.map((b) => b.style.transform)).not.toEqual(before)
  })
})
