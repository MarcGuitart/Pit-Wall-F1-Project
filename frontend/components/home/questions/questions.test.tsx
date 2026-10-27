// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Q1Pace } from './Q1Pace'
import { Q2Tyre } from './Q2Tyre'
import { Q3Pit } from './Q3Pit'
import { Q4Chaos } from './Q4Chaos'
import { CountUp } from '../CountUp'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Q1 true pace', () => {
  it('chips remove each kind of lap (aria-pressed) and the median follows', () => {
    const { container } = render(<Q1Pace />)
    const median = () => (container.querySelector('[data-testid="median"]') as SVGGElement).style.transform
    const before = median()
    expect(screen.getByText(/Median of/).textContent).toBe('Median of 12 laps')
    for (const name of ['Remove pit laps', 'Remove safety car laps', 'Remove outliers']) {
      const chip = screen.getByRole('button', { name })
      expect(chip.getAttribute('aria-pressed')).toBe('false')
      fireEvent.click(chip)
    }
    expect(screen.getByRole('button', { name: 'Pit laps removed' }).getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelectorAll('rect[data-removed="true"]')).toHaveLength(5)
    expect(screen.getByText(/Median of/).textContent).toBe('Median of 7 laps: clean laps only')
    expect(median()).not.toBe(before)
  })
})

describe('Q2 tyre degradation', () => {
  it('each lap is a slider; moving one moves the slope', () => {
    render(<Q2Tyre />)
    const points = screen.getAllByRole('slider')
    expect(points).toHaveLength(6)
    expect(points[5].getAttribute('aria-orientation')).toBe('vertical')
    const slope = () => screen.getByText(/per lap of tyre age/).textContent
    const before = slope()
    fireEvent.keyDown(points[5], { key: 'PageUp' })
    expect(points[5].getAttribute('aria-valuenow')).toBe('59')
    expect(slope()).not.toBe(before)
    fireEvent.keyDown(points[5], { key: 'End' })
    expect(points[5].getAttribute('aria-valuenow')).toBe('100')
    expect(points[5].getAttribute('aria-valuetext')).toBe('Lap 6 of the stint: 100 of 100, higher is slower')
  })
})

describe('Q3 pit cycles', () => {
  it('the stop lap is a slider with Home, End and arrows; a safety car in the window says why', () => {
    render(<Q3Pit />)
    const slider = screen.getByRole('slider', { name: 'Car A stops on lap' })
    expect(slider.getAttribute('aria-valuenow')).toBe('8')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider.getAttribute('aria-valuenow')).toBe('9')
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(slider.getAttribute('aria-valuenow')).toBe('2')
    fireEvent.keyDown(slider, { key: 'End' })
    expect(slider.getAttribute('aria-valuetext')).toBe('lap 19')
    fireEvent.keyDown(slider, { key: 'Home' })
    for (let i = 0; i < 6; i++) fireEvent.keyDown(slider, { key: 'ArrowRight' })   // lap 8, in the window
    expect(screen.queryByText(/not timing alone/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Safety car in window' }))
    expect(screen.getByText('Gains are not timing alone: the safety car made this stop cheaper.')).toBeTruthy()
  })
})

describe('Q4 chaos index', () => {
  it('presets give the backend scores; a slider to its end fills that component', () => {
    render(<Q4Chaos />)
    const score = () => screen.getByText(/^(Low|Medium|High|Extreme)$/).parentElement!.textContent
    expect(score()).toBe('11 Low')
    fireEvent.click(screen.getByRole('button', { name: 'Safety car and rain' }))
    expect(score()).toBe('80 Extreme')
    expect(screen.getByRole('button', { name: 'Safety car and rain' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Dry race' }))
    const sc = screen.getByRole('slider', { name: 'Laps neutralised' })
    fireEvent.keyDown(sc, { key: 'End' })
    expect(sc.getAttribute('aria-valuetext')).toBe('50 % of laps')
    expect(screen.getByText(/^30 of 30 points/)).toBeTruthy()
  })
})

describe('CountUp', () => {
  it('reduced motion: the value at once', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia
    render(<CountUp value={27303} format={(n) => n.toLocaleString('en-GB')} />)
    expect(document.body.textContent).toBe('27,303')
  })
  it('otherwise ends on the value', async () => {
    vi.useFakeTimers()
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia
    render(<CountUp value={28} format={String} />)
    await act(async () => { vi.advanceTimersByTime(700) })
    expect(document.body.textContent).toBe('28')
    vi.useRealTimers()
  })
})

describe('Questions section', () => {
  it('labels Q1 to Q3 Illustrative and Q4 Real formula; the static diagram holds the slot until in view', async () => {
    const observe = vi.fn()
    vi.stubGlobal('IntersectionObserver', class { observe = observe; disconnect() {} constructor() {} })
    const { Questions } = await import('../Questions')
    const { container } = render(<Questions />)
    const cells = container.querySelectorAll('[data-question]')
    expect(cells).toHaveLength(4)
    const tags = Array.from(cells, (c) => within(c as HTMLElement).getByText(/Illustrative|Real formula/).textContent)
    expect(tags).toEqual(['Illustrative', 'Illustrative', 'Illustrative', 'Real formula, illustrative inputs'])
    for (const c of Array.from(cells)) {
      expect(c.querySelector('[data-island="question"]')!.getAttribute('data-state')).toBe('idle')
      expect(c.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
      expect(within(c as HTMLElement).getByText('What to look for.')).toBeTruthy()
    }
    expect(observe).toHaveBeenCalledTimes(4)
    expect(container.textContent).not.toMatch(/[–—]| - /)
  })
})
