import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RECONS, featuredRecon, reconFor } from './recon'
import { heightAt, lapPlayer, personName, sAtTime, sampleRate, stepMetres, traceAt, zoneAhead, zoneFacts, zoneFocus, type Recon } from '@/components/recon/data'

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
      expect(['brake', 'speed', undefined]).toContain(data.zones_by)
      expect(data.zones.map((z) => z.id)).toEqual(data.zones.map((_, i) => i + 1))
      expect(data.zones.every((z, i) => i === 0 || z.from > data.zones[i - 1].from)).toBe(true)
      expect(data.zones.every((z) => z.drop >= 20 && z.from <= z.to && z.minSpeed < z.fromSpeed)).toBe(true)
    })
    it(`${r.slug}: the fluid lap covers the whole lap, in order, and wraps at the line`, () => {
      const p = lapPlayer(data)
      let prev = -1
      for (let t = 0; t < p.total; t += 0.05) { const sv = p.at(t); expect(sv).toBeGreaterThanOrEqual(prev); prev = sv }
      expect(p.at(p.total - 0.01)).toBeGreaterThan(data.length_m * 0.95)
      expect(p.at(p.total + 0.05)).toBeLessThan(data.length_m * 0.05)  // past the line: the lap starts again
      const z = data.zones[2]
      expect(p.at(0, z.from - 150)).toBeCloseTo(z.from - 150, -1)      // a lap begun at a zone starts there
      expect(traceAt(data.trace, sAtTime(data.trace, 10)).time).toBeCloseTo(10, 0)
    })
    it(`${r.slug}: every figure the zone panel shows is read from the trace`, () => {
      const hz = sampleRate(data.trace)
      expect(hz).toBeGreaterThan(3)  // OpenF1 car data, about 3.7 to 4 Hz
      expect(hz).toBeLessThan(5)
      for (const z of data.zones) {
        const f = zoneFacts(data, z)
        expect(f.entry).toBe(Math.round(data.trace.find((row) => row[0] === z.from)![1]))        // the speed at the first braking sample
        expect(f.min).toBe(Math.min(...data.trace.filter((row) => row[0] >= z.from && row[0] <= z.apex).map((row) => row[1])))
        expect(f.metres).toBe(Math.round(z.to - z.from))
        if (data.zones_by !== 'speed') {  // first and last brake sample
          expect(data.trace.find((row) => row[0] === z.from)![3]).toBe(1)
          expect(data.trace.find((row) => row[0] === z.to)![3]).toBe(1)
          expect(z.seconds).toBeCloseTo(data.trace.find((row) => row[0] === z.to)![5] - data.trace.find((row) => row[0] === z.from)![5], 1)
        }
        expect(f.id).toBe(z.id)
        expect(f.of).toBe(data.zones.length)
        if (f.climb != null) expect(Math.abs(f.climb)).toBeLessThanOrEqual(data.elevation_m)
        expect(stepMetres(f.entry, hz)).toBeGreaterThan(0)
      }
    })
    it(`${r.slug}: the zone a lap is heading for`, () => {
      expect(zoneAhead(data, 0)).toBe(0)
      expect(zoneAhead(data, data.zones[3].apex - 100)).toBe(3)
      expect(zoneAhead(data, data.zones[3].apex + 100)).toBe(4)
      expect(zoneAhead(data, data.length_m - 1)).toBe(0)  // past the last: the first again
      const f = zoneFocus(data.zones[0])
      expect(f.s).toBeGreaterThan(data.zones[0].from)
      expect(f.to).toBeGreaterThanOrEqual(data.zones[0].apex)
      expect(f.from).toBe(data.zones[0].from)
    })
  }
})

describe('heightAt', () => {
  const data = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'recon', 'interlagos.json'), 'utf8')) as Recon
  it('follows the recorded line, closed at the start line', () => {
    expect(heightAt(data, 0)).toBeCloseTo(data.line[0][2], 5)
    expect(heightAt(data, data.line_s[10])).toBeCloseTo(data.line[10][2], 5)
    const mid = (data.line_s[10] + data.line_s[11]) / 2
    expect(heightAt(data, mid)).toBeCloseTo((data.line[10][2] + data.line[11][2]) / 2, 5)
    expect(heightAt(data, data.length_m)).toBeCloseTo(heightAt(data, 0), 5)
    const all = Array.from({ length: 200 }, (_, i) => heightAt(data, (i / 200) * data.length_m))
    expect(Math.max(...all) - Math.min(...all)).toBeLessThanOrEqual(data.elevation_m + 0.01)
  })
})

describe('a lap without a brake signal', () => {
  const data = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'recon', 'interlagos.json'), 'utf8')) as Recon
  it('has no time on the brakes, and says so rather than inventing one', () => {
    const z = { ...data.zones[0], seconds: null }
    expect(zoneFacts({ ...data, zones_by: 'speed', zones: [z] }, z).seconds).toBeNull()
  })
  it('shows no height change on a recording without a height', () => {
    expect(zoneFacts({ ...data, elevation_m: 0 }, data.zones[0]).climb).toBeNull()
  })
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
