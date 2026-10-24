// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const ics = vi.hoisted(() => ({ downloadIcs: vi.fn() }))
vi.mock('@/lib/ics', async (orig) => ({ ...(await orig<typeof import('@/lib/ics')>()), downloadIcs: ics.downloadIcs }))

import { AddToCalendarButton } from './AddToCalendarButton'

afterEach(() => { cleanup(); ics.downloadIcs.mockReset() })

const event = { uid: 'u@pitwallengineer.com', summary: 'Austin · Race', location: 'Austin', dateStart: '2026-10-25T19:00:00Z', dateEnd: '2026-10-25T21:00:00Z' }

describe('Add to calendar', () => {
  it('opens a menu with Google Calendar and Apple or Outlook (.ics)', () => {
    render(<AddToCalendarButton event={event} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to calendar: Austin · Race' }))
    const google = screen.getByRole('link', { name: 'Google Calendar' })
    expect(google.getAttribute('target')).toBe('_blank')
    expect(google.getAttribute('href')).toContain('dates=20261025T190000Z%2F20261025T210000Z')
    fireEvent.click(screen.getByRole('button', { name: 'Apple or Outlook (.ics)' }))
    expect(ics.downloadIcs).toHaveBeenCalledTimes(1)
    const [name, body] = ics.downloadIcs.mock.calls[0]
    expect(name).toMatch(/\.ics$/)
    expect(body).toContain('DTEND:20261025T210000Z')
  })

  it('with a session key, the .ics comes from the API (block 33), not from the browser', async () => {
    const body = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n'
    const fetchSpy = vi.fn(async (_url: string) => new Response(body, { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    render(<AddToCalendarButton event={event} sessionKey={11400} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to calendar: Austin · Race' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apple or Outlook (.ics)' }))
    await waitFor(() => expect(ics.downloadIcs).toHaveBeenCalledTimes(1))
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/sessions\/11400\/calendar\.ics$/)
    expect(ics.downloadIcs.mock.calls[0][1]).toBe(body)
    vi.unstubAllGlobals()
  })

  it.each([
    ['an API without calendar.ics (404)', async () => new Response('{"error":{}}', { status: 404 })],
    ['a network failure', async () => { throw new TypeError('Failed to fetch') }],
    ['an answer that is not a calendar', async () => new Response('<html>', { status: 200 })],
  ])('%s: says so and keeps Google Calendar', async (_, impl) => {
    vi.stubGlobal('fetch', vi.fn(impl))
    render(<AddToCalendarButton event={event} sessionKey={11400} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to calendar: Austin · Race' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apple or Outlook (.ics)' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Calendar file is not available right now'))
    expect(ics.downloadIcs).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Google Calendar' })).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('promises no reminder', () => {
    render(<AddToCalendarButton event={event} />)
    fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }))
    expect(document.body.textContent).not.toMatch(/notif|remind|alert/i)
  })
})
