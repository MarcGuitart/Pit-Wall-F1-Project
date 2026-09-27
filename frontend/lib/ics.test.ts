import { describe, expect, it } from 'vitest'
import ICAL from 'ical.js'
import {
  buildSessionIcs,
  escapeIcsText,
  foldIcsLine,
  formatIcsUtc,
  icsFilename,
} from './ics'

describe('escapeIcsText', () => {
  it('escapes backslash, semicolon and comma', () => {
    expect(escapeIcsText('a\\b;c,d')).toBe('a\\\\b\;c\\,d')
  })
  it('turns a literal newline into the two characters \\n', () => {
    expect(escapeIcsText('line1\nline2')).toBe('line1\\nline2')
  })
  it('handles CRLF and bare CR too', () => {
    expect(escapeIcsText('a\r\nb\rc')).toBe('a\\nb\\nc')
  })
  it('escapes the backslash before it would double-escape the others', () => {
    // a literal backslash-n in the source must not come out looking like an
    // escaped newline
    expect(escapeIcsText('a\\nb')).toBe('a\\\\nb')
  })
  it('leaves ordinary text untouched', () => {
    expect(escapeIcsText('Baku City Circuit')).toBe('Baku City Circuit')
  })
})

describe('foldIcsLine', () => {
  it('leaves a short line alone', () => {
    expect(foldIcsLine('SUMMARY:Pit Wall — Baku Race')).toBe('SUMMARY:Pit Wall — Baku Race')
  })

  it('folds a line over 75 characters with CRLF + one leading space', () => {
    const long = 'DESCRIPTION:' + 'x'.repeat(100)
    const folded = foldIcsLine(long)
    const segments = folded.split('\r\n')
    expect(segments.length).toBeGreaterThan(1)
    // every continuation segment after the first starts with the fold space
    for (const seg of segments.slice(1)) expect(seg.startsWith(' ')).toBe(true)
    // unfolding (strip CRLF+space) must reproduce the original line exactly
    expect(folded.replace(/\r\n /g, '')).toBe(long)
  })

  it('no segment (after removing the fold space) exceeds 75 characters', () => {
    const long = 'DESCRIPTION:' + 'y'.repeat(300)
    const segments = foldIcsLine(long).split('\r\n')
    for (const seg of segments) {
      const content = seg.startsWith(' ') ? seg.slice(1) : seg
      expect(content.length).toBeLessThanOrEqual(75)
    }
  })
})

describe('formatIcsUtc', () => {
  it('converts an ISO timestamp with offset to UTC basic format', () => {
    expect(formatIcsUtc('2026-09-26T11:00:00+00:00')).toBe('20260926T110000Z')
  })
  it('converts a non-UTC offset correctly', () => {
    expect(formatIcsUtc('2026-09-26T15:00:00+04:00')).toBe('20260926T110000Z')
  })
  it('accepts an already-Z timestamp', () => {
    expect(formatIcsUtc('2026-09-26T11:00:00Z')).toBe('20260926T110000Z')
  })
  it('throws rather than emit a corrupt date for unparsable input', () => {
    expect(() => formatIcsUtc('not-a-date')).toThrow()
  })
})

describe('icsFilename', () => {
  it('turns spaces into dashes and drops punctuation', () => {
    expect(icsFilename('Pit Wall — Baku Race')).toBe('Pit-Wall-Baku-Race.ics')
  })
  it('falls back to a generic name when nothing survives sanitising', () => {
    expect(icsFilename('★★★')).toBe('session.ics')
  })
})

// ── the generated file itself ────────────────────────────────────────────────

const SAMPLE = {
  uid: 'pitwall-11377-race@pitwallengineer.com',
  summary: 'Pit Wall — Azerbaijan Grand Prix Race',
  description: 'Baku City Circuit. Analysis on pitwallengineer.com once published.',
  location: 'Baku City Circuit, Azerbaijan',
  dateStart: '2026-09-26T11:00:00Z',
  dateEnd: '2026-09-26T13:00:00Z',
  dtstamp: '2026-09-01T00:00:00Z',
}

describe('buildSessionIcs — structure', () => {
  const ics = buildSessionIcs(SAMPLE)

  it('starts and ends with the calendar boundary, uses CRLF throughout', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).not.toMatch(/[^\r]\n/) // no bare LF anywhere
  })

  it('declares VERSION 2.0 and a PRODID', () => {
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toMatch(/PRODID:.+/)
  })

  it('contains exactly one VEVENT', () => {
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1)
    expect((ics.match(/END:VEVENT/g) ?? []).length).toBe(1)
  })

  it('has DTSTART before DTEND, both in UTC Z form', () => {
    expect(ics).toContain('DTSTART:20260926T110000Z')
    expect(ics).toContain('DTEND:20260926T130000Z')
  })

  it('every required VEVENT property is present', () => {
    for (const prop of ['UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'SUMMARY']) {
      expect(ics).toMatch(new RegExp(`\\n${prop}:`))
    }
  })
})

describe('buildSessionIcs — parses as valid RFC 5545 (ical.js)', () => {
  const ics = buildSessionIcs(SAMPLE)
  const jcal = ICAL.parse(ics)
  const comp = new ICAL.Component(jcal)

  it('parses without throwing', () => {
    expect(comp.name).toBe('vcalendar')
  })

  it('has exactly one VEVENT sub-component', () => {
    const events = comp.getAllSubcomponents('vevent')
    expect(events.length).toBe(1)
  })

  it('round-trips the summary, location and description', () => {
    const event = new ICAL.Event(comp.getFirstSubcomponent('vevent')!)
    expect(event.summary).toBe(SAMPLE.summary)
    expect(event.location).toBe(SAMPLE.location)
    expect(event.description).toBe(SAMPLE.description)
  })

  it('round-trips start and end as the correct UTC instants', () => {
    const event = new ICAL.Event(comp.getFirstSubcomponent('vevent')!)
    expect(event.startDate.toJSDate().toISOString()).toBe('2026-09-26T11:00:00.000Z')
    expect(event.endDate.toJSDate().toISOString()).toBe('2026-09-26T13:00:00.000Z')
  })

  it('the UID round-trips exactly', () => {
    const event = new ICAL.Event(comp.getFirstSubcomponent('vevent')!)
    expect(event.uid).toBe(SAMPLE.uid)
  })
})

describe('buildSessionIcs — special characters survive a parse round-trip', () => {
  it('a comma, semicolon and backslash in the summary come back unescaped', () => {
    const tricky = buildSessionIcs({
      ...SAMPLE,
      summary: 'Race, Qualifying; and FP1 \\ notes',
    })
    const comp = new ICAL.Component(ICAL.parse(tricky))
    const event = new ICAL.Event(comp.getFirstSubcomponent('vevent')!)
    expect(event.summary).toBe('Race, Qualifying; and FP1 \\ notes')
  })

  it('a long description folds but still parses back to the original text', () => {
    const longDescription = 'Circuit notes. '.repeat(20) // well over 75 chars
    const withLongDesc = buildSessionIcs({ ...SAMPLE, description: longDescription })
    expect(withLongDesc).toContain('\r\n ') // actually folded, not left as one giant line
    const comp = new ICAL.Component(ICAL.parse(withLongDesc))
    const event = new ICAL.Event(comp.getFirstSubcomponent('vevent')!)
    expect(event.description).toBe(longDescription)
  })
})

describe('buildSessionIcs — optional fields', () => {
  it('omits LOCATION and DESCRIPTION lines entirely when not given', () => {
    const minimal = buildSessionIcs({
      uid: SAMPLE.uid,
      summary: SAMPLE.summary,
      dateStart: SAMPLE.dateStart,
      dateEnd: SAMPLE.dateEnd,
    })
    expect(minimal).not.toContain('LOCATION:')
    expect(minimal).not.toContain('DESCRIPTION:')
    // and it still parses
    const comp = new ICAL.Component(ICAL.parse(minimal))
    expect(comp.getFirstSubcomponent('vevent')!).toBeTruthy()
  })

  it('DTSTAMP defaults to dateStart when not given', () => {
    const noStamp = buildSessionIcs({
      uid: SAMPLE.uid,
      summary: SAMPLE.summary,
      dateStart: SAMPLE.dateStart,
      dateEnd: SAMPLE.dateEnd,
    })
    expect(noStamp).toContain('DTSTAMP:20260926T110000Z')
  })
})
