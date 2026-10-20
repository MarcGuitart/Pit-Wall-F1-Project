// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Popover } from './Popover'
import { StatusBadge, ConfidenceBadge } from './Badge'
import { Segmented } from './Controls'
import { DataTable, Row, Cell } from './Table'
import { Banner } from './Banner'

afterEach(cleanup)

describe('Popover — click, keyboard, Escape, outside', () => {
  function setup() {
    render(
      <div>
        <Popover trigger="Live" triggerLabel="Live mode" title="No live session right now">
          <button type="button">Add to calendar</button>
        </Popover>
        <p>outside</p>
      </div>,
    )
    return screen.getByRole('button', { name: 'Live mode' })
  }

  it('is closed until the trigger is clicked, and says so in aria-expanded', () => {
    const t = setup()
    expect(t.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(t)
    expect(t.getAttribute('aria-expanded')).toBe('true')
    const dlg = screen.getByRole('dialog', { name: 'No live session right now' })
    expect(t.getAttribute('aria-controls')).toBe(dlg.id)
  })

  it('keeps its own buttons reachable: moving to them does not close it', () => {
    const t = setup()
    fireEvent.click(t)
    fireEvent.mouseLeave(t)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Add to calendar' }))
    expect(screen.getByRole('button', { name: 'Add to calendar' })).toBeTruthy()
  })

  it('is a real <button>, so Enter and Space open it from the keyboard', () => {
    const t = setup()
    expect(t.tagName).toBe('BUTTON')
    expect(t.getAttribute('type')).toBe('button')
  })

  it('closes on Escape and gives focus back to the trigger', () => {
    const t = setup()
    fireEvent.click(t)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(t)
  })

  it('closes on a click or tap outside', () => {
    const t = setup()
    fireEvent.click(t)
    fireEvent.pointerDown(screen.getByText('outside'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('toggles closed on a second click of the trigger', () => {
    const t = setup()
    fireEvent.click(t)
    fireEvent.click(t)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('StatusBadge', () => {
  it('never draws failed and not-applicable the same way', () => {
    render(<><StatusBadge state="failed" /><StatusBadge state="not_applicable" /></>)
    const failed = screen.getByText('Failed')
    const na = screen.getByText('Not applicable')
    expect(failed.className).not.toBe(na.className)
  })
})

describe('ConfidenceBadge', () => {
  it('lights one, two or three dots and always writes the word', () => {
    const { container } = render(<ConfidenceBadge level="Medium" />)
    expect(screen.getByText('Medium confidence')).toBeTruthy()
    const dots = container.querySelectorAll('[aria-hidden="true"] > span')
    expect(dots).toHaveLength(3)
    expect(Array.from(dots).filter((d) => /dotOn/.test(d.className))).toHaveLength(2)
  })
  it('says Unverified with no level rather than guessing', () => {
    render(<ConfidenceBadge level={null} />)
    expect(screen.getByText('Unverified')).toBeTruthy()
  })
})

describe('Segmented', () => {
  function Harness() {
    const [v, setV] = useState<'a' | 'b' | 'c'>('a')
    return <Segmented label="Mode" value={v} onChange={setV} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]} />
  }
  it('moves with the arrow keys and wraps', () => {
    render(<Harness />)
    const group = screen.getByRole('radiogroup', { name: 'Mode' })
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(screen.getByRole('radio', { name: 'C' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: 'A' }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('Row', () => {
  it('activates with the mouse and with Enter or Space', () => {
    const go = vi.fn()
    render(
      <DataTable label="Pace" columns={[{ key: 'd', label: 'Driver', width: '1fr' }]}>
        <Row onActivate={go} label="VER"><Cell>VER</Cell></Row>
      </DataTable>,
    )
    const row = screen.getByRole('row', { name: 'VER' })
    fireEvent.click(row)
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.keyDown(row, { key: ' ' })
    expect(go).toHaveBeenCalledTimes(3)
    expect(row.getAttribute('tabindex')).toBe('0')
  })
})

describe('Banner', () => {
  it('announces a bad state as an alert and the rest as status', () => {
    render(<><Banner tone="bad">Connection lost</Banner><Banner>Stream connected</Banner></>)
    expect(screen.getByRole('alert').textContent).toContain('Connection lost')
    expect(screen.getByRole('status').textContent).toContain('Stream connected')
  })
})
