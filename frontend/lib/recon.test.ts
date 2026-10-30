import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RECONS, featuredRecon, reconFor } from './recon'
import { personName, sAtTime, timeline, traceAt, type Recon } from '@/components/recon/data'

describe('reconFor', () => {
  it('links the Grand Prix of the season the lap prepares, and only that one', () => {
    expect(reconFor({ circuit_short_name: 'Interlagos', year: 2026 })?.slug).toBe('interlagos')
    expect(reconFor({ circuit_short_name: 'interlagos', year: 2026 })?.slug).toBe('interlagos')
    expect(reconFor({ circuit_short_name: 'Interlagos', year: 2024 })).toBeNull()
    expect(reconFor({ circuit_short_name: 'Austin', year: 2026 })).toBeNull()
    expect(reconFor({ circuit_short_name: null, year: 2026 })).toBeNull()
  })
})

describe('published Recon Lap files', () => {
  for (const r of RECONS) {
    const data = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'recon', `${r.slug}.json`), 'utf8')) as Recon
    it(`${r.slug}: the previous season's pole lap, scaled to the official length`, () => {
      expect(data.year).toBe(r.forYear - 1)
      expect(data.lap.kind).toBe('pole')
      expect(data.length_source).toMatch(/^https:\/\/www\.formula1\.com\//)
      expect(data.trace.at(-1)![0]).toBeLessThanOrEqual(data.length_m)
      expect(data.trace.every((row, i) => i === 0 || row[0] >= data.trace[i - 1][0])).toBe(true)
    })
    it(`${r.slug}: braking zones numbered BZ1… in lap order, each losing at least 20 km/h`, () => {
      expect(data.zones.map((z) => z.id)).toEqual(data.zones.map((_, i) => i + 1))
      expect(data.zones.every((z, i) => i === 0 || z.from > data.zones[i - 1].from)).toBe(true)
      expect(data.zones.every((z) => z.drop >= 20 && z.from <= z.to && z.minSpeed < z.fromSpeed)).toBe(true)
    })
    it(`${r.slug}: the automatic lap holds at every zone and covers the whole lap`, () => {
      const tl = timeline(data)
      const stops = new Set<number>()
      for (let t = 0; t < tl.total; t += 0.05) { const p = tl.at(t); if (p.stop != null) stops.add(p.stop) }
      expect(Array.from(stops).sort((a, b) => a - b)).toEqual(data.zones.map((z) => z.id))
      expect(tl.at(tl.total - 0.01).s).toBeGreaterThan(data.length_m * 0.95)
      expect(traceAt(data.trace, sAtTime(data.trace, 10)).time).toBeCloseTo(10, 0)
    })
  }
})

describe('featuredRecon', () => {
  it('features São Paulo until the Monday after its weekend, then nothing', () => {
    expect(featuredRecon(Date.parse('2026-11-04T12:00:00Z'))?.slug).toBe('interlagos')
    expect(featuredRecon(Date.parse('2026-11-09T00:00:00Z'))).toBeNull()
  })
})

describe('personName', () => {
  it('writes OpenF1 capital surnames with one initial capital', () => {
    expect(personName('Lando NORRIS')).toBe('Lando Norris')
    expect(personName('Andrea Kimi ANTONELLI')).toBe('Andrea Kimi Antonelli')
    expect(personName("Pato O'WARD")).toBe("Pato O'Ward")
    expect(personName('Jean-Éric VERGNE')).toBe('Jean-Éric Vergne')
    expect(personName('Lando Norris')).toBe('Lando Norris')
    expect(personName(null)).toBeNull()
  })
})
