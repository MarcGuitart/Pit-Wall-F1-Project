// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { armReveal } from './Reveal'

const observed: Element[] = []
class IO {
  constructor(public cb: IntersectionObserverCallback) {}
  observe(el: Element) { observed.push(el) }
  unobserve() {}
  disconnect() {}
}

function page() {
  document.body.innerHTML = '<div id="a" data-reveal></div><div id="b" data-reveal></div><div id="c"></div>'
  const at = { a: 100, b: 2000 } as Record<string, number>
  for (const id of ['a', 'b']) {
    document.getElementById(id)!.getBoundingClientRect = () => ({ top: at[id] } as DOMRect)
  }
}

function motion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: reduced && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }))
}

beforeEach(() => {
  observed.length = 0
  ;(window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
  page()
})
afterEach(() => { document.body.innerHTML = '' })

describe('reveal', () => {
  it('hides only blocks below the fold, with opacity and transform', () => {
    motion(false)
    armReveal()
    const a = document.getElementById('a')!, b = document.getElementById('b')!
    expect(a.style.opacity).toBe('')           // on screen: never touched
    expect(b.style.opacity).toBe('0')
    expect(b.style.transform).toBe('translateY(8px)')
    expect(b.style.transition).toMatch(/opacity 200ms.*transform 200ms/)
    expect(b.style.transition).not.toMatch(/height|top|margin/)
    expect(observed).toEqual([b])
  })

  it('does nothing under prefers-reduced-motion', () => {
    motion(true)
    armReveal()
    expect(document.getElementById('b')!.style.opacity).toBe('')
    expect(observed).toEqual([])
  })

  it('without the first scroll nothing is hidden: the markup alone is fully visible', () => {
    Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]')).forEach((el) => expect(el.style.opacity).toBe(''))
  })
})
