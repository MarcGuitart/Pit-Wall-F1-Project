// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { PageContainer } from './PageContainer'

/** Block 32, task 6: text pages sit in one centred, capped container (the geometry check measures it). */
afterEach(cleanup)

describe('PageContainer', () => {
  it('marks its width for the geometry check', () => {
    const { container } = render(<PageContainer width="narrow"><p>x</p></PageContainer>)
    expect(container.firstElementChild?.getAttribute('data-page-container')).toBe('narrow')
  })

  it('wraps every text page and state', () => {
    const root = join(__dirname, '../..')
    for (const [f, width] of [['app/docs/page.tsx', 'reading'], ['app/settings/page.tsx', 'narrow'], ['app/not-found.tsx', 'narrow'],
      ['components/access/ProWall.tsx', 'narrow'], ['components/analysis/SessionUnavailableState.tsx', 'narrow']]) {
      expect(readFileSync(join(root, f), 'utf8'), f).toContain(`<PageContainer width="${width}">`)
    }
  })

  it('docs: a ~70-character column and, from 1024 px, an index beside it that stays in view', () => {
    const css = readFileSync(join(__dirname, '../layout/page.module.css'), 'utf8')
    expect(css).toMatch(/\.docBody \{[^}]*max-width: 70ch/)
    expect(css).toMatch(/@media \(min-width: 1024px\) \{[\s\S]*\.docNav \{[^}]*position: sticky/)
  })
})
