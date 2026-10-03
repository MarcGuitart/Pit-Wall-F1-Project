import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  bandsFromLaps, cumulative, dashedSet, fuelCorrected, fuelModel, gapToReference, lapTimeEvolution, tyreDegradation,
  type ChartDriver,
} from './lapCharts'

const drv = (code: string, colour: string, times: number[], extra: Partial<ChartDriver> = {}): ChartDriver => ({
  number: code.charCodeAt(0), code, colour, position: null, stints: [],
  laps: times.map((time, i) => ({ lap: i + 1, time, pitOut: false, pitIn: false })),
  ...extra,
})

describe('lap charts', () => {
  it('groups consecutive neutralised laps into typed bands', () => {
    expect(bandsFromLaps([12, 10, 11, 20], l => (l >= 20 ? 'VSC' : 'SC'))).toEqual([
      { kind: 'SC', from: 10, to: 12 }, { kind: 'VSC', from: 20, to: 20 },
    ])
  })

  it('draws the second car of a team dashed', () => {
    expect(Array.from(dashedSet([drv('A', '#f00', [1]), drv('B', '#F00', [1]), drv('C', '#0f0', [1])]))).toEqual(['B'])
  })

  it('leaves lap 1 and pit laps out of lap-time evolution', () => {
    const d = drv('A', '#f00', [100, 90, 91, 92])
    d.laps[2].pitIn = true
    expect(lapTimeEvolution([d]).series[0].points).toEqual([[2, 90], [4, 92]])
  })

  it('measures the gap from the leader and stops at a missing lap', () => {
    const a = drv('A', '#f00', [90, 90, 90])
    const b = drv('B', '#00f', [91, 91, 91])
    b.laps.splice(1, 1)
    expect(cumulative(b).size).toBe(1)
    const g = gapToReference([a, b], { kind: 'leader' })
    expect(g.series[0].points).toEqual([[1, 0], [2, 0], [3, 0]])
    expect(g.series[1].points).toEqual([[1, 1]])
  })

  it('corrects to race-end fuel and recovers a known degradation slope', () => {
    const total = 30
    const { perLapMs } = fuelModel(total)
    // 50 ms/lap of tyre wear on top of the fuel the model will take out again
    const times = Array.from({ length: 15 }, (_, i) => 90 + 0.05 * i + (perLapMs * (total - (i + 1))) / 1000)
    const d = drv('A', '#f00', times, { stints: [{ stint_number: 1, compound: 'SOFT', lap_start: 1, lap_end: 15, tyre_age_at_start: 0 }] })
    expect(fuelCorrected(times[14], 15, total)).toBeCloseTo(90 + 0.05 * 14, 6)
    const fit = tyreDegradation([d], [], total).fits[0]
    expect(fit.slope).toBeCloseTo(0.05, 4)
    expect(fit.points[0][0]).toBe(2)   // lap 1 is out; age counts from fitting
  })

  const baku = join(__dirname, '../../backend/cache/11377/_lap_charts.json')
  it.skipIf(!existsSync(baku))('runs on the Baku race', () => {
    const data = JSON.parse(readFileSync(baku, 'utf8'))
    const drivers: ChartDriver[] = data.drivers.map((d: any) => ({
      ...d, laps: d.laps.map(([lap, time, pitOut, pitIn]: [number, number, boolean, boolean]) => ({ lap, time, pitOut, pitIn })),
    }))
    const gap = gapToReference(drivers, { kind: 'driver', code: data.winner })
    const winner = gap.series.find(s => s.code === data.winner)!
    expect(winner.points.every(p => p[1] === 0)).toBe(true)
    expect(tyreDegradation(drivers, data.bands, data.total_laps).fits.length).toBeGreaterThan(10)
  })
})
