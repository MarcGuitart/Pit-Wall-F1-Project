// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: nav.push }) }))

import { Hero } from './Hero'
import { Plans } from './Plans'
import { Closing } from './Closing'
import { useSweep } from '@/lib/sweep'

// Block 48: the landing's calls to action into the race list sweep, with "Races" on the bands.
beforeEach(() => {
  useSweep.getState().reset()
  nav.push.mockReset()
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

describe('landing calls to action into /races', () => {
  for (const [name, ui, text] of [
    ['Hero', <Hero key="h" />, 'Pick a race →'],
    ['Plans', <Plans key="p" />, 'Pick a race'],
    ['Closing', <Closing key="c" />, 'Open the season grid'],
  ] as const) {
    it(`${name}: a plain click sweeps to /races`, () => {
      render(ui)
      const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/races' && a.textContent?.startsWith(text))!
      fireEvent.click(link, { button: 0 })
      expect(nav.push).toHaveBeenCalledWith('/races')
      expect(useSweep.getState().phase).toBe('cover')
      expect(useSweep.getState().label).toBe('Races')
    })
  }

  it('reduced motion: the same click only navigates', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    render(<Closing />)
    fireEvent.click(screen.getByRole('link', { name: /Open the season grid/ }), { button: 0 })
    expect(useSweep.getState().phase).toBe('idle')
  })
})
