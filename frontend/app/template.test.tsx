// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
// CSS modules resolve to an identity map under vitest's default css handling
vi.mock('@/components/layout/shell.module.css', () => ({ default: { enter: 'enter' } }))

import Template, { __resetTemplateForTests } from './template'

afterEach(cleanup)

describe('page-enter transition (app/template.tsx)', () => {
  it('does not animate the first page of a document (LCP: nothing to transition from)', () => {
    __resetTemplateForTests()
    pathname = '/race/9636'
    const { container } = render(<Template><main>race</main></Template>)
    expect(container.querySelector('.enter')).toBeNull()
  })

  it('wraps every later page so its <main> plays the entry animation', () => {
    __resetTemplateForTests()
    pathname = '/'
    render(<Template><main>landing</main></Template>)
    cleanup()
    pathname = '/race/9636'
    const { container } = render(<Template><main>race</main></Template>)
    expect((container.firstChild as HTMLElement).className).toBe('enter')
  })

  it('does not delay the content: it is in the DOM on the first render', () => {
    pathname = '/'
    render(<Template><main>landing content</main></Template>)
    expect(screen.getByText('landing content')).toBeTruthy()
  })

  it('is not applied on /live', () => {
    pathname = '/'
    render(<Template><main>landing</main></Template>)
    cleanup()
    pathname = '/live/11377'
    const { container } = render(<Template><main>live</main></Template>)
    expect(container.querySelector('.enter')).toBeNull()
    expect((container.firstChild as HTMLElement).tagName).toBe('MAIN')
  })
})

describe('the animation itself (shell.module.css)', () => {
  const css = readFileSync(join(__dirname, '../components/layout/shell.module.css'), 'utf8')
  const keyframes = css.match(/@keyframes pwEnter\s*{([\s\S]*?)}\s*}/)?.[1] ?? ''

  it('animates only opacity and transform', () => {
    const props = Array.from(keyframes.matchAll(/([a-z-]+)\s*:/g), (m) => m[1])
    expect(props.length).toBeGreaterThan(0)
    expect(new Set(props)).toEqual(new Set(['opacity', 'transform']))
  })

  it('rises 8 px and fades from 0', () => {
    expect(keyframes).toMatch(/from\s*{\s*opacity:\s*0;\s*transform:\s*translateY\(8px\)/)
  })

  it('lasts 180 ms (inside the 160-200 ms brief) with no delay', () => {
    const rule = css.match(/\.enter main\s*{\s*animation:\s*([^;]+);/)?.[1] ?? ''
    expect(rule).toMatch(/^pwEnter 180ms /)
    const ms = Number(rule.match(/(\d+)ms/)?.[1])
    expect(ms).toBeGreaterThanOrEqual(160)
    expect(ms).toBeLessThanOrEqual(200)
    // a second time value would be a delay
    expect(rule.match(/\d+m?s\b/g)).toHaveLength(1)
  })

  it('does nothing at all with prefers-reduced-motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*{\s*\.enter main\s*{\s*animation:\s*none;/)
  })

  it('has no exit animation', () => {
    expect(css).not.toMatch(/@keyframes pw(Exit|Leave|Out)/i)
  })
})
