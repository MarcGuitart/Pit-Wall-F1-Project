// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const nav = vi.hoisted(() => ({ pathname: '/races', push: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: nav.push }) }))

import { SweepOverlay } from './SweepOverlay'
import { SweepLink } from './SweepLink'
import { useSweep } from '@/lib/sweep'
import { usePendingRace } from '@/lib/raceNav'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const phase = () => document.documentElement.dataset.sweep ?? 'idle'
const layer = () => document.querySelector('[data-phase]') as HTMLElement | null

beforeEach(() => {
  vi.useFakeTimers()
  nav.pathname = '/races'
  nav.push.mockReset()
  useSweep.getState().reset()
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(() => { cleanup(); vi.useRealTimers(); delete document.documentElement.dataset.sweep })

function arrive(rerender: (ui: React.ReactElement) => void, path: string) {
  nav.pathname = path
  rerender(<SweepOverlay />)
}

describe('SweepOverlay', () => {
  it('fast route: cover 260, hold to 380, uncover to 700, with the destination on the bands', () => {
    const { rerender } = render(<SweepOverlay />)
    act(() => useSweep.getState().start('/race/9636', 'São Paulo · 2024'))
    expect(phase()).toBe('cover')
    expect(screen.getByText('São Paulo · 2024')).toBeTruthy()
    expect(layer()!.dataset.direction).toBe('forward')
    act(() => { vi.advanceTimersByTime(100) })
    arrive(rerender, '/race/9636')                 // the route is here at 100 ms
    act(() => { vi.advanceTimersByTime(160) })     // 260
    expect(phase()).toBe('hold')
    act(() => { vi.advanceTimersByTime(119) })     // 379
    expect(phase()).toBe('hold')
    act(() => { vi.advanceTimersByTime(1) })       // 380
    expect(phase()).toBe('uncover')
    expect(layer()!.dataset.gaveUp).toBeUndefined()
    act(() => { vi.advanceTimersByTime(320) })     // 700
    expect(phase()).toBe('idle')
    expect(layer()).toBeNull()
  })

  it('slow route: holds until it arrives', () => {
    const { rerender } = render(<SweepOverlay />)
    act(() => useSweep.getState().start('/race/9636', 'x'))
    act(() => { vi.advanceTimersByTime(3000) })
    expect(phase()).toBe('hold')
    arrive(rerender, '/race/9636')
    act(() => { vi.advanceTimersByTime(0) })
    expect(phase()).toBe('uncover')
  })

  it('gives up at 8 s: uncovers over the waking loader', () => {
    render(<SweepOverlay />)
    act(() => useSweep.getState().start('/race/9636', 'x'))
    act(() => { vi.advanceTimersByTime(7999) })
    expect(phase()).toBe('hold')
    act(() => { vi.advanceTimersByTime(1) })
    expect(phase()).toBe('uncover')
    expect(layer()!.dataset.gaveUp).toBe('true')
  })

  it('live mode sweeps the other way', () => {
    render(<SweepOverlay />)
    act(() => useSweep.getState().start('/live/11377', 'Live mode'))
    expect(layer()!.dataset.direction).toBe('reverse')
  })

  it('back or forward: a route change alone never sweeps', () => {
    const { rerender } = render(<SweepOverlay />)
    arrive(rerender, '/race/9636')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(phase()).toBe('idle')
    expect(layer()).toBeNull()
  })
})

describe('SweepLink', () => {
  it('a plain click sweeps and navigates; the bands show its label', () => {
    render(<><SweepLink href="/live/11377" label="Live mode">Open live mode</SweepLink><SweepOverlay /></>)
    fireEvent.click(screen.getByRole('link', { name: 'Open live mode' }), { button: 0 })
    expect(nav.push).toHaveBeenCalledWith('/live/11377')
    expect(phase()).toBe('cover')
  })

  it('a modified click, or reduced motion, is left to the browser and never sweeps', () => {
    render(<><SweepLink href="/live/11377" label="Live mode">Open live mode</SweepLink><SweepOverlay /></>)
    const link = screen.getByRole('link', { name: 'Open live mode' })
    fireEvent.click(link, { button: 0, metaKey: true })
    expect(phase()).toBe('idle')
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    fireEvent.click(link, { button: 0 })
    expect(phase()).toBe('idle')
    expect(nav.push).not.toHaveBeenCalled()
  })
})


describe('block 48: the sweep into /races', () => {
  it('a landing call to action sweeps with "Races" on the bands, forward, no pending race', () => {
    nav.pathname = '/'
    usePendingRace.getState().set(null)
    render(<><SweepLink href="/races" label="Races">Pick a race</SweepLink><SweepOverlay /></>)
    fireEvent.click(screen.getByRole('link', { name: 'Pick a race' }), { button: 0 })
    expect(nav.push).toHaveBeenCalledWith('/races')
    expect(phase()).toBe('cover')
    expect(layer()!.dataset.direction).toBe('forward')
    expect(layer()!.textContent).toContain('Races')
    expect(usePendingRace.getState().pending).toBeNull()
  })

  it('reduced motion: /races is a plain navigation', () => {
    nav.pathname = '/'
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    render(<><SweepLink href="/races" label="Races">Pick a race</SweepLink><SweepOverlay /></>)
    const link = screen.getByRole('link', { name: 'Pick a race' })
    fireEvent.click(link, { button: 0 })
    expect(phase()).toBe('idle')
  })

  it('a route change on its own (back, forward, first load) never sweeps', () => {
    nav.pathname = '/'
    const { rerender } = render(<SweepOverlay />)
    arrive(rerender, '/races')
    expect(phase()).toBe('idle')
  })
})

describe('block 34 audit fixes', () => {
  it('the bands and the destination use the design tokens, no fixed colours', () => {
    const css = readFileSync(join(__dirname, 'sweep.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).toMatch(/\.accent \{[^}]*var\(--pw-accent\)/)
    expect(css).toMatch(/\.ground \{[^}]*var\(--pw-bg\)/)
    expect(css).toMatch(/\.grey \{[^}]*var\(--pw-divider\)[^}]*var\(--pw-bg\)/)
    expect(css).toMatch(/\.label \{[^}]*color: var\(--pw-text\)/)
  })

  it('the layer carries the token scope and stays transparent itself', () => {
    render(<SweepOverlay />)
    act(() => useSweep.getState().start('/race/9636', 'x'))
    expect(layer()!.className).toMatch(/root/)
    expect(layer()!.style.background).toBe('transparent')
  })

  it('a swept click to live mode leaves the shell its loader to show', () => {
    usePendingRace.setState({ pending: null })
    render(<><SweepLink href="/live/11400" label="Live · Austin · Race">Open live mode</SweepLink><SweepOverlay /></>)
    fireEvent.click(screen.getByRole('link', { name: 'Open live mode' }), { button: 0 })
    expect(usePendingRace.getState().pending).toEqual({ href: '/live/11400', key: 11400, kind: 'live' })
    usePendingRace.setState({ pending: null })
  })
})

describe('block 48: the wait on the bands', () => {
  const css = readFileSync(join(__dirname, 'sweep.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const wait = () => document.querySelector('[data-sweep-wait]') as HTMLElement | null
  const clock = () => document.querySelector('[data-sweep-clock]')?.textContent

  function clickToRaces() {
    nav.pathname = '/'
    usePendingRace.getState().set(null)
    const utils = render(<><SweepLink href="/races" label="Races">Pick a race</SweepLink><SweepOverlay /></>)
    fireEvent.click(screen.getByRole('link', { name: 'Pick a race' }), { button: 0 })
    return utils
  }

  it('says what is loading and the real time since the click, as mm:ss', () => {
    clickToRaces()
    act(() => { vi.advanceTimersByTime(400) })
    expect(phase()).toBe('hold')
    expect(wait()!.getAttribute('role')).toBe('status')
    expect(wait()!.textContent).toContain('Loading Races')
    expect(clock()).toBe('00:00')
    act(() => { vi.advanceTimersByTime(2_700) })
    expect(clock()).toBe('00:03')
    expect(wait()!.dataset.sweepWait).toBe('loading')
  })

  it('claims nothing it cannot know: no percentage, no count, no advancing bar', () => {
    clickToRaces()
    act(() => { vi.advanceTimersByTime(5_000) })
    const text = layer()!.textContent ?? ''
    expect(text).not.toMatch(/%/)
    expect((text.match(/\d+/g) ?? []).join(' ')).toBe('00 05')     // the clock, nothing else
    expect(document.querySelector('[role="progressbar"], progress, [style*="scaleX"]')).toBeNull()
  })

  it('/races not there at 8 s: "This is taking longer than usual", the bands hold, then give up at 20 s', () => {
    clickToRaces()
    act(() => { vi.advanceTimersByTime(7_999) })
    expect(screen.queryByText('This is taking longer than usual')).toBeNull()
    act(() => { vi.advanceTimersByTime(1) })
    act(() => { vi.advanceTimersByTime(250) })
    expect(phase()).toBe('hold')
    expect(wait()!.dataset.sweepWait).toBe('long')
    expect(screen.getByText('This is taking longer than usual')).toBeTruthy()
    expect(clock()).toBe('00:08')
    act(() => { vi.advanceTimersByTime(11_750) })
    expect(phase()).toBe('uncover')
    expect(layer()!.dataset.gaveUp).toBe('true')
    expect(wait()).toBeNull()
  })

  it('/races arriving at 2 s: the bands leave and the wait goes with them', () => {
    const { rerender } = clickToRaces()
    act(() => { vi.advanceTimersByTime(2_000) })
    nav.pathname = '/races'
    rerender(<><SweepLink href="/races" label="Races">Pick a race</SweepLink><SweepOverlay /></>)
    act(() => { vi.advanceTimersByTime(10) })
    expect(phase()).toBe('uncover')
    expect(wait()).toBeNull()
  })

  it('a race still gives up at 8 s, onto its own loader (unchanged)', () => {
    nav.pathname = '/races'
    render(<SweepOverlay />)
    act(() => { useSweep.getState().start('/race/9636', 'São Paulo · 2024', Date.now()) })
    act(() => { vi.advanceTimersByTime(8_000) })
    expect(phase()).toBe('uncover')
  })

  it('the stroke pulses in opacity only, the one loop; reduced motion stops it and keeps the clock', () => {
    const loops = Array.from(css.matchAll(/([^{}]+)\{([^{}]*infinite[^{}]*)\}/g), (m) => m[1].trim())
    expect(loops).toEqual(['.layer[data-phase="hold"] .stroke'])
    expect(css).toMatch(/@keyframes strokePulse \{ 50% \{ opacity: 0\.45; \} \}/)
    expect(css).toMatch(/\.stroke \{[^}]*background: var\(--pw-accent\)/)
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toMatch(/\.layer\[data-phase="hold"\] \.stroke \{ animation: none; \}/)
    expect(reduced).not.toMatch(/\.clock[^{]*\{[^}]*(display: none|visibility: hidden|opacity: 0)/)
  })
})
