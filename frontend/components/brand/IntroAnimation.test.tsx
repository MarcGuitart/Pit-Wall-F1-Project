// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { IntroAnimation } from './IntroAnimation'

const SEEN_KEY = 'pwiq_intro_seen'

function mockMatchMedia(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  sessionStorage.clear()
  mockMatchMedia(false)
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Render and flush past the "ready -> playing" tick, so the overlay (once
 *  past the reduced-motion / seen checks) is actually in the DOM. */
function renderAndEnter() {
  render(<IntroAnimation />)
  act(() => {
    vi.advanceTimersByTime(0)
  })
}

describe('prefers-reduced-motion', () => {
  it('renders a short fade instead of nothing at all (Block 25)', () => {
    mockMatchMedia(true)
    renderAndEnter()
    expect(screen.getByLabelText('Skip intro')).toBeTruthy()
  })

  it('never scales the car — only opacity, via the reduced-fade keyframe', () => {
    mockMatchMedia(true)
    renderAndEnter()
    const overlay = screen.getByLabelText('Skip intro')
    expect(overlay.style.animation).toContain('pwIntroReducedFade')
    expect(overlay.style.transform).toBe('')
    // the inner wrapper has a fixed width and no transform/transition at all
    const wrapper = overlay.firstElementChild as HTMLElement
    expect(wrapper.style.transform).toBe('')
    expect(wrapper.style.transition).toBe('')
  })

  it('is shorter than the full animation', () => {
    mockMatchMedia(true)
    renderAndEnter()
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(screen.getByLabelText('Skip intro')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByLabelText('Skip intro')).toBeNull()
  })

  it('marks the session seen once the fade completes — it did play something', () => {
    mockMatchMedia(true)
    renderAndEnter()
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(sessionStorage.getItem(SEEN_KEY)).toBe('1')
  })

  it('is skippable like the full animation', () => {
    mockMatchMedia(true)
    renderAndEnter()
    const overlay = screen.getByLabelText('Skip intro')
    act(() => {
      fireEvent.click(overlay)
    })
    expect(sessionStorage.getItem(SEEN_KEY)).toBe('1')
    expect(screen.queryByLabelText('Skip intro')).toBeNull()
  })

  it('does not show the full zoom animation instead', () => {
    mockMatchMedia(true)
    renderAndEnter()
    const overlay = screen.getByLabelText('Skip intro')
    expect(overlay.style.transition).not.toContain('opacity 220ms')
  })
})

describe('first visit of the session', () => {
  it('renders on the first visit (no prior sessionStorage flag)', () => {
    renderAndEnter()
    expect(screen.getByLabelText('Skip intro')).toBeTruthy()
  })

  it('does not render at all on a second mount within the same session', () => {
    sessionStorage.setItem(SEEN_KEY, '1')
    renderAndEnter()
    expect(screen.queryByLabelText('Skip intro')).toBeNull()
  })

  it('marks the session as seen once the animation completes', () => {
    renderAndEnter()
    act(() => {
      vi.advanceTimersByTime(1400)
    })
    expect(sessionStorage.getItem(SEEN_KEY)).toBe('1')
    expect(screen.queryByLabelText('Skip intro')).toBeNull()
  })
})

describe('skippable', () => {
  it('a click immediately marks it seen and removes the overlay', () => {
    renderAndEnter()
    const overlay = screen.getByLabelText('Skip intro')
    act(() => {
      fireEvent.click(overlay)
    })
    expect(sessionStorage.getItem(SEEN_KEY)).toBe('1')
    expect(screen.queryByLabelText('Skip intro')).toBeNull()
  })

  it('a keypress also skips it', () => {
    renderAndEnter()
    const overlay = screen.getByLabelText('Skip intro')
    act(() => {
      fireEvent.keyDown(overlay, { key: 'Enter' })
    })
    expect(screen.queryByLabelText('Skip intro')).toBeNull()
  })
})
