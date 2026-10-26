import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHAOS_FULL_SCALE, CHAOS_METHOD_VERSION, CHAOS_THRESHOLDS, CHAOS_WEIGHTS, chaosLevel, chaosScore, roundHalfEven } from './chaos'

// The landing's Q4 says "Real formula": these numbers must be the backend's.
const PY = readFileSync(join(__dirname, '..', '..', 'backend', 'app', 'services', 'chaos_service.py'), 'utf8')

function pyDict(name: string): Record<string, number> {
  const block = PY.match(new RegExp(`^${name}:[^=]*=\\s*\\{([\\s\\S]*?)^\\}`, 'm'))?.[1]
  expect(block, name).toBeTruthy()
  return Object.fromEntries(Array.from(block!.matchAll(/"(\w+)":\s*([\d.]+)/g), (m) => [m[1], Number(m[2])]))
}

describe('lib/chaos.ts against chaos_service.py', () => {
  it('same METHOD_VERSION, WEIGHTS, FULL_SCALE and THRESHOLDS', () => {
    expect(PY).toContain(`METHOD_VERSION = "${CHAOS_METHOD_VERSION}"`)
    expect(pyDict('WEIGHTS')).toEqual(CHAOS_WEIGHTS)
    expect(pyDict('FULL_SCALE')).toEqual(CHAOS_FULL_SCALE)
    const th = PY.match(/^THRESHOLDS:[^=]*=\s*\[(.*)\]/m)![1]
    const pairs = Array.from(th.matchAll(/\((\d+),\s*"(\w+)"\)/g), (m) => [Number(m[1]), m[2]])
    expect(pairs).toEqual(CHAOS_THRESHOLDS.map(([f, l]) => [f, l]))
  })

  it('scores as the backend does (values from chaos_service on 21 Oct 2026)', () => {
    expect(chaosScore({ safety_car: 0, yellow_flags: 0.02, stewarding: 0.05, weather: 0, position_volatility: 0.04 })).toBe(11)
    expect(chaosScore({ safety_car: 0.2, yellow_flags: 0.1, stewarding: 0.3, weather: 0.6, position_volatility: 0.1 })).toBe(80)
    expect(chaosScore({ safety_car: 0.5, yellow_flags: 0.3, stewarding: 1, weather: 1, position_volatility: 0.3 })).toBe(100)
    expect(chaosLevel(11)).toBe('Low')
    expect(chaosLevel(80)).toBe('Extreme')
  })

  it("rounds halves to even, like Python's round", () => {
    expect(roundHalfEven(2.5)).toBe(2)
    expect(roundHalfEven(3.5)).toBe(4)
    expect(roundHalfEven(0.25, 1)).toBe(0.2)
    expect(roundHalfEven(16.66, 1)).toBe(16.7)
  })
})
