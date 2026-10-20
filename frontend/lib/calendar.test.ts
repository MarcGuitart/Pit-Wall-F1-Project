import { describe, expect, it } from 'vitest'
import { googleCalendarUrl, icsUrl } from './calendar'
import { buildSessionIcs } from './ics'

const austin = {
  uid: 'pitwall-live-2026-10-23T17:30:00Z@pitwallengineer.com',
  summary: 'Pit Wall · Austin Practice 1',
  description: 'Live mode on Pit Wall Engineer follows the session while it runs.',
  location: 'Austin',
  dateStart: '2026-10-23T17:30:00+00:00',
  dateEnd: '2026-10-23T18:30:00+00:00',
}

describe('Google Calendar URL', () => {
  it('is a TEMPLATE link with compact UTC dates from date_start to date_end', () => {
    const u = new URL(googleCalendarUrl(austin))
    expect(`${u.origin}${u.pathname}`).toBe('https://calendar.google.com/calendar/render')
    expect(u.searchParams.get('action')).toBe('TEMPLATE')
    expect(u.searchParams.get('text')).toBe('Pit Wall · Austin Practice 1')
    expect(u.searchParams.get('dates')).toBe('20261023T173000Z/20261023T183000Z')
    expect(u.searchParams.get('location')).toBe('Austin')
    expect(u.searchParams.get('details')).toContain('Live mode')
  })

  it('converts any offset to UTC', () => {
    const u = new URL(googleCalendarUrl({ ...austin, dateStart: '2026-10-23T12:30:00-05:00', dateEnd: '2026-10-23T13:30:00-05:00' }))
    expect(u.searchParams.get('dates')).toBe('20261023T173000Z/20261023T183000Z')
  })
})

describe('.ics', () => {
  it('is built in the browser until the API serves it (block 33)', () => {
    expect(icsUrl(11740)).toBeNull()
    expect(icsUrl(11740, true)).toMatch(/\/sessions\/11740\/calendar\.ics$/)
    expect(icsUrl(undefined, true)).toBeNull()
  })

  it('carries the same event: UTC start and end, stable UID, no alarm', () => {
    const ics = buildSessionIcs(austin)
    expect(ics).toContain('DTSTART:20261023T173000Z')
    expect(ics).toContain('DTEND:20261023T183000Z')
    expect(ics).toContain('UID:pitwall-live-2026-10-23T17:30:00Z@pitwallengineer.com')
    expect(ics).not.toContain('VALARM')
  })
})
