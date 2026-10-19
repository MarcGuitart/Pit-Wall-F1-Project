import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * No text under 11 px (Block 31, decision of 18 Oct: the 10 px labels move to
 * the --pw-text-xs token, 11 px). Scans the styles that set HTML text size:
 * CSS modules, Tailwind arbitrary sizes and inline style objects. SVG
 * fontSize attributes are user units scaled with their chart, not pixels on
 * screen, and are not covered here (the geometry check measures what renders).
 */
const ROOT = join(__dirname, '..')
const DIRS = ['app', 'components']
const files: string[] = []
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(css|tsx|ts)$/.test(n) && !/\.test\.tsx?$/.test(n)) files.push(p)
  }
}
DIRS.forEach((d) => walk(join(ROOT, d)))

const RULES: [string, RegExp][] = [
  ['CSS font-size', /font-size:\s*([0-9.]+)px/g],
  ['Tailwind text-[Npx]', /\btext-\[([0-9.]+)px\]/g],
  ['inline fontSize', /\bfontSize:\s*'?([0-9.]+)(?:px)?'?\s*[,}]/g],
]

describe('text size', () => {
  it('the token is 11 px', () => {
    expect(readFileSync(join(ROOT, 'app/globals.css'), 'utf8')).toMatch(/--pw-text-xs:\s*11px/)
  })

  it('nothing sets text under 11 px', () => {
    const under: string[] = []
    for (const f of files) {
      const text = readFileSync(f, 'utf8')
      for (const [what, rx] of RULES) {
        for (const m of Array.from(text.matchAll(rx))) {
          if (Number(m[1]) < 11) under.push(`${relative(ROOT, f)}: ${what} ${m[0].trim()}`)
        }
      }
    }
    expect(under).toEqual([])
  })
})
