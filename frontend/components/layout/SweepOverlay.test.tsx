// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const nav = vi.hoisted(() => ({ pathname: '/races', push: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: nav.push }) }))

import { SweepOverlay } from './SweepOverlay'
import { SweepLink } from './SweepLink'
import { useSweep } from '@/lib/sweep'

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
