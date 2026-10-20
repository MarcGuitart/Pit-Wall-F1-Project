// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { EngineerNote } from '@/types'
import { EngineerSignalSummary } from './EngineerSignalSummary'

afterEach(cleanup)

const note = (lap: number, severity: EngineerNote['severity'], type: EngineerNote['type'], title: string): EngineerNote =>
  ({ lap_number: lap, severity, type, title, message: `${title} message` }) as EngineerNote

// Catalogue order as the backend stores it (and as it numbers chat citations S1…Sn).
const NOTES = [
  note(1, 'Low', 'WEATHER', 'Rainfall — strategy window opens'),
  note(27, 'Medium', 'PIT_IMPACT', 'BEA slow stop L27'),
  note(28, 'High', 'CHAOS', 'Safety car L28'),
  note(41, 'High', 'TYRE_DEGRADATION', 'VER SOFT cliff risk'),
]

describe('EngineerSignalSummary', () => {
  it('ranks by severity on a copy: the page\'s notes keep their catalogue order', () => {
    const notes = [...NOTES]
    const before = notes.map((n) => n.title)
    render(<EngineerSignalSummary notes={notes} onViewAll={() => undefined} />)
    // shown by severity…
    const els = NOTES.map((n) => screen.getByText(n.title))
    const shown = [...els].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).map((e) => e.textContent)
    expect(shown.slice(0, 2).sort()).toEqual(['Safety car L28', 'VER SOFT cliff risk'])
    // …while the array every other panel reads is untouched
    expect(notes.map((n) => n.title)).toEqual(before)
  })

  it('leaves the order alone through every filter too', () => {
    const notes = [...NOTES]
    const before = notes.map((n) => n.title)
    render(<EngineerSignalSummary notes={notes} onViewAll={() => undefined} />)
    for (const name of [/^Tyre/, /^SC\/VSC/, /^Pit/, /^Weather/, /^All/]) {
      fireEvent.click(screen.getByRole('button', { name }))
    }
    expect(notes.map((n) => n.title)).toEqual(before)
  })
})
