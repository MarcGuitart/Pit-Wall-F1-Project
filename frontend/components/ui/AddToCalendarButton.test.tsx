// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

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

  it('promises no reminder', () => {
    render(<AddToCalendarButton event={event} />)
    fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }))
    expect(document.body.textContent).not.toMatch(/notif|remind|alert/i)
  })
})
