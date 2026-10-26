import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Block 32, task 3: OpenF1 and FastF1 are named as data sources in plain text
 * (/docs, the footer) and linked from nowhere in the UI.
 */
const ROOT = join(__dirname, '..')
const walk = (d: string, out: string[] = []): string[] => {
  for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) out.push(p) }
  return out
}

describe('data sources', () => {
  it('no link to OpenF1 or FastF1 anywhere in the UI', () => {
    const links = ['app', 'components'].flatMap((d) => walk(join(ROOT, d)))
      .flatMap((f) => (readFileSync(f, 'utf8').match(/href=["'{`][^"'`}]*(openf1\.org|fastf1)[^"'`}]*/gi) ?? []).map((m) => `${relative(ROOT, f)}: ${m}`))
    expect(links).toEqual([])
  })

  it('/docs still names both, as plain text', () => {
    const docs = readFileSync(join(ROOT, 'app/docs/page.tsx'), 'utf8')
    expect(docs).toMatch(/OpenF1/)
    expect(docs).toMatch(/FastF1/)
  })
})
