// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { FullRaceAnalysis } from '@/types'

// Decision of 18 Oct (Block 31): the driver card is a modal dialog — focus
// moves into it on open, Tab stays inside it, and on close focus goes back to
// what opened it.
vi.mock('./teamradio/RadioClipPlayer', () => ({ RadioClipPlayer: () => null }))

import { DriverCard } from './DriverCard'

afterEach(cleanup)

const analysis = JSON.parse(readFileSync(join(__dirname, '../../../backend/cache/9539/_analysis.json'), 'utf8')) as FullRaceAnalysis
const driver = analysis.true_pace[0]

function Harness({ withEngineer = true }: { withEngineer?: boolean }) {
  const [open, setOpen] = useState(false)
  const [renders, setRenders] = useState(0)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>open {driver.driver_code}</button>
      <button type="button" onClick={() => setRenders((n) => n + 1)}>rerender {renders}</button>
      {open && (
        <DriverCard driver={driver} stints={analysis.tyre_degradation} pits={analysis.pit_impact} raceName="Test"
          onClose={() => setOpen(false)} onAskEngineer={withEngineer ? () => setOpen(false) : undefined} />
      )}
    </>
  )
}

const tab = (shift = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab', shiftKey: shift })

describe('driver card focus', () => {
  it('moves focus into the dialog on open', () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: /^open/ })
    opener.focus(); fireEvent.click(opener)
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('keeps Tab and Shift+Tab inside the dialog', () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: /^open/ })
    opener.focus(); fireEvent.click(opener)
    const dialog = screen.getByRole('dialog')
    const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('button'))
    expect(buttons.length).toBeGreaterThan(0)
    buttons[buttons.length - 1].focus(); tab()
    expect(document.activeElement).toBe(buttons[0])
    buttons[0].focus(); tab(true)
    expect(document.activeElement).toBe(buttons[buttons.length - 1])
  })

  it('gives focus back to the opener on Escape and on the close button', () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: /^open/ })
    opener.focus(); fireEvent.click(opener)
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    opener.focus(); fireEvent.click(opener)
    fireEvent.click(screen.getByRole('button', { name: 'Close the driver card' }))
    expect(document.activeElement).toBe(opener)
  })
})
