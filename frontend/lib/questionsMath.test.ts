import { describe, expect, it } from 'vitest'
import { PIT, leastSquares, median, pitGaps, pitTraces } from './questionsMath'

describe('median', () => {
  it('odd, even, empty', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe('leastSquares matches numpy.polyfit(x, y, 1), the backend linear_slope', () => {
  // Reference values from numpy on 21 Oct 2026.
  it.each([
    [[1, 2, 3, 4, 5, 6], [50, 52, 55, 57, 60, 61], 2.314286, 47.733333],
    [[3, 7, 8, 12, 15], [10, 9.5, 11, 12.25, 13], 0.287791, 8.559884],
  ])('x=%j y=%j', (xs, ys, slope, intercept) => {
    const fit = leastSquares(xs.map((x, i) => ({ x, y: ys[i] })))!
    expect(fit.slope).toBeCloseTo(slope, 5)
    expect(fit.intercept).toBeCloseTo(intercept, 5)
  })
  it('needs two distinct x', () => {
    expect(leastSquares([{ x: 1, y: 1 }])).toBeNull()
    expect(leastSquares([{ x: 1, y: 1 }, { x: 1, y: 2 }])).toBeNull()
  })
})

describe('pitGaps', () => {
  it('same lap as B: level all race', () => {
    expect(pitGaps(PIT.bStop, false).every((g) => g === 0)).toBe(true)
  })
  it('an earlier stop costs the loss, then gains on fresh tyres until B stops', () => {
    const g = pitGaps(8, false)
    expect(g[6]).toBe(0)                                   // lap 7
    expect(g[7]).toBeCloseTo(-PIT.loss)                    // lap 8: the stop
    expect(g[8]).toBeCloseTo(-PIT.loss + PIT.freshGain)    // lap 9: the first fresh lap
    expect(g[PIT.laps - 1]).toBeCloseTo(3 * PIT.freshGain) // the stop costs both the same
  })
  it('a stop under the safety car is cheaper: the gain is not timing alone', () => {
    const plain = pitGaps(8, false)[PIT.laps - 1]
    const sc = pitGaps(8, true)[PIT.laps - 1]
    expect(sc - plain).toBeCloseTo(PIT.loss - PIT.scLoss)
  })
})

describe('pitTraces', () => {
  it('the two traces differ by exactly the gap, lap by lap', () => {
    for (const stop of [3, 8, 11, 15]) for (const sc of [false, true]) {
      const { a, b } = pitTraces(stop, sc)
      const g = pitGaps(stop, sc)
      a.forEach((v, i) => expect(v - b[i]).toBeCloseTo(g[i], 5))
    }
  })
})
