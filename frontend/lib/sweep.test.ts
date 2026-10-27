import { describe, expect, it } from 'vitest'
import { COVER_MS, GIVE_UP_MS, HOLD_MS, UNCOVER_MS, shouldSweep, sweepTarget, uncoverAt } from './sweep'

const click = { button: 0 }

describe('sweepTarget', () => {
  it('a race, live mode, or the race list (block 48)', () => {
    expect(sweepTarget('/race/9636')).toBe('race')
    expect(sweepTarget('/live/11377?x=1')).toBe('live')
    expect(sweepTarget('/races')).toBe('races')
    expect(sweepTarget('/races?year=2024')).toBe('races')
    for (const href of ['/', '/docs', '/settings', '/races/x', '/race/', '/race/abc', '/preview/race/9636']) {
      expect(sweepTarget(href)).toBeNull()
    }
  })
})

describe('shouldSweep: only a plain click to another race or live page', () => {
  it('sweeps a plain click', () => {
    expect(shouldSweep('/race/9636', '/races', click, false)).toBe(true)
    expect(shouldSweep('/live/11377', '/', click, false)).toBe(true)
  })
  it('not without a click (programmatic, back, forward)', () => {
    expect(shouldSweep('/race/9636', '/races', null, false)).toBe(false)
    expect(shouldSweep('/race/9636', '/races', undefined, false)).toBe(false)
  })
  it('not a modified, middle or already handled click', () => {
    for (const c of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }, { defaultPrevented: true }]) {
      expect(shouldSweep('/race/9636', '/races', { button: 0, ...c }, false)).toBe(false)
    }
  })
  it('not with reduced motion, not to the page already open, not to other routes', () => {
    expect(shouldSweep('/race/9636', '/races', click, true)).toBe(false)
    expect(shouldSweep('/race/9636', '/race/9636', click, false)).toBe(false)
    expect(shouldSweep('/settings', '/', click, false)).toBe(false)
    expect(shouldSweep('/docs', '/', click, false)).toBe(false)
  })
  it('the race list sweeps on a plain click, never with reduced motion, never onto itself', () => {
    expect(shouldSweep('/races', '/', click, false)).toBe(true)
    expect(shouldSweep('/races', '/race/9636', click, false)).toBe(true)
    expect(shouldSweep('/races', '/', click, true)).toBe(false)
    expect(shouldSweep('/races', '/races', click, false)).toBe(false)
    expect(shouldSweep('/races', '/', null, false)).toBe(false)            // back, forward, first load
  })
})

describe('uncoverAt: the timeline', () => {
  it('a fast route is done in 700 ms: 260 cover, 120 hold, 320 uncover', () => {
    expect(COVER_MS + HOLD_MS + UNCOVER_MS).toBe(700)
    expect(uncoverAt(0, 50)).toEqual({ at: 380, gaveUp: false })
    expect(uncoverAt(1000, 1000)).toEqual({ at: 1380, gaveUp: false })
  })
  it('a slower route: the bands leave when it arrives', () => {
    expect(uncoverAt(0, 2000)).toEqual({ at: 2000, gaveUp: false })
  })
  it('never past 8 s: the bands leave and the loader says waking', () => {
    expect(GIVE_UP_MS).toBe(8000)
    expect(uncoverAt(0, null)).toEqual({ at: 8000, gaveUp: true })
    expect(uncoverAt(0, 9000)).toEqual({ at: 8000, gaveUp: true })
  })
})
