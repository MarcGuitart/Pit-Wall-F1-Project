import { describe, expect, it } from 'vitest'
import { contextPills } from './contextPills'

const rows = (n: number) => Array.from({ length: n }, () => ({})) as never[]

describe('contextPills', () => {
  it('shows a pill only for data the analysis carries', () => {
    expect(contextPills({ tyre_degradation: rows(33), pit_impact: rows(18) })).toEqual(['Tyres loaded', 'Pit mapped'])
    expect(contextPills({ tyre_degradation: rows(33), pit_impact: [] })).toEqual(['Tyres loaded'])
    expect(contextPills({ tyre_degradation: [], pit_impact: rows(2) })).toEqual(['Pit mapped'])
    expect(contextPills({ tyre_degradation: [], pit_impact: [] })).toEqual([])
  })

  it('never claims race control was parsed: there is no field to check it against', () => {
    expect(contextPills({ tyre_degradation: rows(1), pit_impact: rows(1) })).not.toContain('Race ctrl parsed')
  })
})
