// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SiteFooter } from './SiteFooter'

/**
 * Block 32, task 4: the one footer, on every page, says who made the project
 * and links LinkedIn and the CV (URL and file recovered from main's footer —
 * public/cv.pdf is in the repo), as buttons in the system's style.
 */
afterEach(cleanup)

describe('SiteFooter', () => {
  it('carries the author line with LinkedIn and CV, with no prop to ask for it', () => {
    render(<SiteFooter />)
    expect(screen.getByRole('contentinfo').textContent).toContain('Project implemented by')
    expect(screen.getByRole('contentinfo').textContent).toContain('Marc Guitart Frescó')
    const li = screen.getByRole('link', { name: /linkedin/i })
    expect(li.getAttribute('href')).toBe('https://www.linkedin.com/in/marc-guitart-fresco/')
    const cv = screen.getByRole('link', { name: /cv/i })
    expect(cv.getAttribute('href')).toBe('/cv.pdf')
    for (const a of [li, cv]) expect(a.className).toMatch(/btn/)
  })

  it('the CV it links is in the repo', () => {
    const pdf = readFileSync(join(__dirname, '../../public/cv.pdf'))
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('its stylesheet is well formed and leaves the buttons their own style', () => {
    const css = readFileSync(join(__dirname, 'shell.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    let depth = 0
    for (const c of css) { if (c === '{') depth++; if (c === '}') depth--; expect(depth).toBeGreaterThanOrEqual(0) }
    expect(depth).toBe(0)
    expect(css).not.toMatch(/\.footer a\s*\{/)           // would out-rank .btn on LinkedIn and CV
  })

  it('pages do not add a footer of their own (one footer per page)', () => {
    for (const f of ['components/live/dashboard/LiveDashboard.tsx', 'app/page.tsx', 'app/docs/page.tsx', 'app/settings/page.tsx', 'app/not-found.tsx']) {
      const code = readFileSync(join(__dirname, '../..', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code, f).not.toMatch(/<footer\b/)
    }
  })
})
