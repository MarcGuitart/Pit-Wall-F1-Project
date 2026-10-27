/**
 * The arithmetic behind the landing's four interactive questions (block 37).
 * Every input is illustrative and has no unit: no lap time, tyre age or gap
 * here is a real one. The methods are the real ones.
 */

/** Median, as the pace analysis takes it over clean laps. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Ordinary least squares, y = slope · x + intercept: what the backend's
 * linear_slope (numpy polyfit, degree 1) fits to lap time against tyre age.
 */
export function leastSquares(points: readonly { x: number; y: number }[]): { slope: number; intercept: number } | null {
  if (points.length < 2) return null
  const n = points.length
  const mx = points.reduce((a, p) => a + p.x, 0) / n
  const my = points.reduce((a, p) => a + p.y, 0) / n
  let sxx = 0
  let sxy = 0
  for (const p of points) {
    sxx += (p.x - mx) ** 2
    sxy += (p.x - mx) * (p.y - my)
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx }
}

/**
 * Q3: two cars on the same pace, B stopping on a fixed lap, A on the lap the
 * reader picks. A stop costs PIT_LOSS; fresh tyres are worth FRESH_GAIN per
 * lap over the other car until it stops too. Under a safety car the stop costs
 * SC_PIT_LOSS instead. Returns A's gap to B after each lap (positive: A
 * ahead), starting level.
 */
export const PIT = { laps: 20, bStop: 11, loss: 20, scLoss: 9, freshGain: 1.2, scWindow: [7, 9] as const }

export function pitGaps(aStop: number, safetyCar: boolean): number[] {
  const inSc = (lap: number) => safetyCar && lap >= PIT.scWindow[0] && lap <= PIT.scWindow[1]
  const cost = (lap: number) => (inSc(lap) ? PIT.scLoss : PIT.loss)
  const gaps: number[] = []
  let gap = 0
  for (let lap = 1; lap <= PIT.laps; lap++) {
    if (lap === aStop) gap -= cost(lap)
    if (lap === PIT.bStop) gap += cost(lap)
    const aFresh = lap > aStop
    const bFresh = lap > PIT.bStop
    if (aFresh && !bFresh) gap += PIT.freshGain
    if (bFresh && !aFresh) gap -= PIT.freshGain
    gaps.push(Math.round(gap * 10) / 10)
  }
  return gaps
}

/**
 * Q3's two traces: each car's time against a car that never stops on old
 * tyres. A stop costs its loss; every lap after it gains FRESH_GAIN, until the
 * other car has stopped too (then both are fresh and neither gains on the
 * other, so the traces run parallel). a[i] minus b[i] is pitGaps(...)[i].
 */
export function pitTraces(aStop: number, safetyCar: boolean): { a: number[]; b: number[] } {
  const gaps = pitGaps(aStop, safetyCar)
  const b: number[] = []
  let t = 0
  for (let lap = 1; lap <= PIT.laps; lap++) {
    if (lap === PIT.bStop) t -= safetyCar && lap >= PIT.scWindow[0] && lap <= PIT.scWindow[1] ? PIT.scLoss : PIT.loss
    if (lap > PIT.bStop) t += PIT.freshGain
    b.push(Math.round(t * 10) / 10)
  }
  return { a: gaps.map((g, i) => Math.round((g + b[i]) * 10) / 10), b }
}
