import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DISPLAY_NAMES, PASSTHROUGH, displayName, displayNameOf, placeOf } from './displayName'
import locations from '@/test/fixtures/openf1_locations_2023_2026.json'

describe('display names, keyed on location', () => {
  it.each([
    ['Marina Bay', 'Singapore'],
    ['Yas Island', 'Abu Dhabi'],
    ['Yas Marina', 'Abu Dhabi'],
    ['Monte Carlo', 'Monaco'],
    ['Lusail', 'Qatar'],
    ['Sakhir', 'Bahrain'],
    ['Miami Gardens', 'Miami'],
  ])('%s → %s', (location, shown) => {
    expect(displayName(location)).toBe(shown)
    expect(displayNameOf({ location })).toBe(shown)
    expect(placeOf({ location, circuit_short_name: 'X' })).toBe(shown)
  })

  it('the table has exactly those seven entries', () => {
    expect(Object.keys(DISPLAY_NAMES).sort()).toEqual(['Lusail', 'Marina Bay', 'Miami Gardens', 'Monte Carlo', 'Sakhir', 'Yas Island', 'Yas Marina'])
  })

  it.each(PASSTHROUGH.map((l) => [l]))('%s passes through unchanged', (location) => {
    expect(displayName(location)).toBe(location)
    expect(DISPLAY_NAMES[location]).toBeUndefined()
  })

  // OpenF1's real (year, location) pairs, 2023–2026 (from /races, only those two
  // fields). A location in neither list is a rename to decide on.
  it('every location OpenF1 used in 2023–2026 is in the table or in PASSTHROUGH', () => {
    const known = new Set([...Object.keys(DISPLAY_NAMES), ...PASSTHROUGH])
    const unknown = (locations as { year: number; location: string }[]).filter((p) => !known.has(p.location))
    expect(unknown).toEqual([])
    expect(locations.length).toBeGreaterThan(90)
  })

  it('a location not in the table is shown as OpenF1 gives it', () => {
    expect(displayName('Kuala Lumpur')).toBe('Kuala Lumpur')
    expect(displayName(' Barcelona ')).toBe('Barcelona')
  })

  it('no location: null, and placeOf falls back to the circuit, then TBC', () => {
    expect(displayName(null)).toBeNull()
    expect(displayName('  ')).toBeNull()
    expect(placeOf({ location: null, circuit_short_name: 'Interlagos' })).toBe('Interlagos')
    expect(placeOf(null)).toBe('TBC')
  })

  it('the data is never changed', () => {
    const race = { location: 'Marina Bay', circuit_short_name: 'Singapore' }
    placeOf(race)
    expect(race.location).toBe('Marina Bay')
  })
})

// Every screen shows a place through this table: no file but lib/displayName.ts
// may read `.location`. lib/ics.ts reads the .ics event's own LOCATION text,
// which callers fill with placeOf(); window/document.location are the browser's.
const ROOT = join(__dirname, '..')
const ALLOWED = new Set(['lib/displayName.ts', 'lib/ics.ts'])

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : []
  })
}

describe('nothing reads location directly', () => {
  it('only lib/displayName.ts touches .location', () => {
    const offenders: string[] = []
    for (const dir of ['app', 'components', 'lib', 'hooks', 'stores']) {
      for (const file of sources(join(ROOT, dir))) {
        const rel = relative(ROOT, file)
        if (ALLOWED.has(rel)) continue
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          if (/\.location\b/.test(line.replace(/\b(window|document|globalThis)\.location\b/g, ''))) offenders.push(`${rel}:${i + 1}`)
        })
      }
    }
    expect(offenders).toEqual([])
  })
})
