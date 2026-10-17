// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Faq, FAQS } from './Faq'

afterEach(cleanup)

// Block 29, task 4. Real keyboard use (Tab, Enter, Space) is checked in a
// browser by scripts/parity/landing29.mjs keys; here, the wiring.
describe('FAQ', () => {
  it('every question is a native button that controls its answer', () => {
    render(<Faq />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(FAQS.length)
    for (const b of buttons) {
      expect(b.tagName).toBe('BUTTON')
      const answer = document.getElementById(b.getAttribute('aria-controls')!)
      expect(answer).toBeTruthy()
      expect(answer!.getAttribute('aria-labelledby')).toBe(b.id)
      expect(answer!.hidden).toBe(b.getAttribute('aria-expanded') !== 'true')
    }
  })

  it('opens one answer at a time and closes it again', () => {
    render(<Faq />)
    const [first, second] = screen.getAllByRole('button')
    expect(first.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(second)
    expect(second.getAttribute('aria-expanded')).toBe('true')
    expect(first.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(second)
    expect(second.getAttribute('aria-expanded')).toBe('false')
  })

  it('says what confidence is, and that the Chaos Index carries none', () => {
    render(<Faq />)
    fireEvent.click(screen.getByRole('button', { name: /How reliable/ }))
    expect(screen.getByText(/Pace, tyre and pit estimates carry a Low, Medium or High confidence label based on the evidence behind them\. The Chaos Index is a measured score and carries no confidence label\./)).toBeTruthy()
  })
})
