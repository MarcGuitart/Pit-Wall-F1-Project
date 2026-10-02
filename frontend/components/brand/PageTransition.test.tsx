// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { PageTransition } from './PageTransition'

let currentPathname = '/'

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}))

function mockMatchMedia(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  mockMatchMedia(false)
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function navigate(rerender: (ui: React.ReactElement) => void, to: string) {
  currentPathname = to
  rerender(<PageTransition />)
  act(() => {
    vi.advanceTimersByTime(0)
  })
}

describe('route changes', () => {
  it('does not play on first mount (nothing to transition from)', () => {
    currentPathname = '/'
    render(<PageTransition />)
    act(() => vi.advanceTimersByTime(0))
    expect(document.querySelector('[aria-hidden="true"].fixed')).toBeNull()
  })

  it('plays when navigating from home to /docs', () => {
    currentPathname = '/'
    const { rerender } = render(<PageTransition />)
    act(() => vi.advanceTimersByTime(0))

    navigate(rerender, '/docs')
    expect(document.querySelector('.fixed.inset-0')).toBeTruthy()
  })

  it('stops playing after its own duration', () => {
    currentPathname = '/'
    const { rerender } = render(<PageTransition />)
    act(() => vi.advanceTimersByTime(0))

    navigate(rerender, '/settings')
    expect(document.querySelector('.fixed.inset-0')).toBeTruthy()

    act(() => vi.advanceTimersByTime(500))
    expect(document.querySelector('.fixed.inset-0')).toBeNull()
  })
})

describe('excluded routes', () => {
  it('never plays navigating into /race/[key]', () => {
    currentPathname = '/'
    const { rerender } = render(<PageTransition />)
    act(() => vi.advanceTimersByTime(0))

    navigate(rerender, '/race/11377')
    expect(document.querySelector('.fixed.inset-0')).toBeNull()
  })

  it('never plays navigating into /live/[key]', () => {
    currentPathname = '/'
    const { rerender } = render(<PageTransition />)
    act(() => vi.advanceTimersByTime(0))

    navigate(rerender, '/live/11377')
    expect(document.querySelector('.fixed.inset-0')).toBeNull()
  })

  it('plays again leaving /race for a non-race page', () => {
    currentPathname = '/race/11377'
    const { rerender } = render(<PageTransition />)
    act(() => vi.advanceTimersByTime(0))

    navigate(rerender, '/docs')
    expect(document.querySelector('.fixed.inset-0')).toBeTruthy()
  })
})

describe('prefers-reduced-motion', () => {
  it('never plays, on any route change', () => {
    mockMatchMedia(true)
    currentPathname = '/'
    const { rerender } = render(<PageTransition />)
    act(() => vi.advanceTimersByTime(0))

    navigate(rerender, '/docs')
    expect(document.querySelector('.fixed.inset-0')).toBeNull()
  })
})

describe('does not block interaction', () => {
  it('the overlay is pointer-events-none', () => {
    currentPathname = '/'
    const { rerender } = render(<PageTransition />)
    act(() => vi.advanceTimersByTime(0))

    navigate(rerender, '/docs')
    const overlay = document.querySelector('.fixed.inset-0')
    expect(overlay?.className).toContain('pointer-events-none')
  })
})
