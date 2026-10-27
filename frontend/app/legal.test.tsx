// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

// Block 44b: Terms, Privacy and Refunds show every decision left to the owner as a visible {{gap}}, and say they are
// a draft, not legal advice.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/terms', useParams: () => ({}) }))
afterEach(cleanup)

import Terms from './terms/page'
import Privacy from './privacy/page'
import Refunds from './refunds/page'

const gaps = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-legal-gap]'), (g) => g.textContent ?? '')

describe('legal pages', () => {
  it('Terms: holder, NIF, address, VAT and the 14 day withdrawal with express consent are gaps', () => {
    const { container } = render(<Terms />)
    const g = gaps(container).join(' ')
    for (const topic of ['holder', 'NIF', 'postal address', 'VAT', '14 day right of withdrawal', 'express consent']) {
      expect(g, topic).toContain(topic)
    }
    expect(container.textContent).toContain('2.99 EUR')
  })

  it('Privacy and Refunds have their gaps too', () => {
    expect(gaps(render(<Privacy />).container).join(' ')).toMatch(/holder.*NIF.*postal address/)
    cleanup()
    expect(gaps(render(<Refunds />).container).join(' ')).toMatch(/14 day right of withdrawal/)
  })

  it('every page says it is a draft and not legal advice, and every gap is written {{like this}}', () => {
    for (const Page of [Terms, Privacy, Refunds]) {
      const { container } = render(<Page />)
      expect(container.textContent).toContain('this page is not legal advice')
      for (const g of gaps(container)) expect(g).toMatch(/^\{\{[^{}]+\}\}$/)
      expect(container.textContent).not.toMatch(/[—–]/)
      cleanup()
    }
  })
})
