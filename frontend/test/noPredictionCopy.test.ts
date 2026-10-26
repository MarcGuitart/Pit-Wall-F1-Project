import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Block 32 addendum 2: /docs and the landing say nothing about predictions,
 * odds or projections, nor that anything was "checked against past races".
 * "Signals, not predictions" stays: it says the opposite.
 */
const ROOT = join(__dirname, '..')
const home = readdirSync(join(ROOT, 'components/home')).filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f)).map((f) => `components/home/${f}`)
const FILES = ['app/docs/page.tsx', 'app/page.tsx', ...home]
const WORDS = /predict\w*|odds|projection\w*|probab\w*|checked against past races/gi

describe('docs and landing copy', () => {
  it('no predictions, odds or projections, other than "not predictions"', () => {
    const found: string[] = []
    for (const f of FILES) {
      const text = readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '')
      for (const m of Array.from(text.matchAll(WORDS))) {
        const before = text.slice(Math.max(0, (m.index ?? 0) - 4), m.index)
        if (/^predictions$/i.test(m[0]) && /not $/i.test(before)) continue
        found.push(`${f}: ${m[0]}`)
      }
    }
    expect(found).toEqual([])
  })

  it('keeps "Signals, not predictions"', () => {
    expect(readFileSync(join(ROOT, 'components/home/Method.tsx'), 'utf8')).toContain('Signals, not predictions')
  })
})
