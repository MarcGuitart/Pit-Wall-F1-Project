import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Block 52b: the build never asks Google Fonts; the faces and their licences are in the repo. */
const root = join(__dirname, '..')
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.name === 'node_modules' || d.name.startsWith('.') ? [] : d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)])

describe('self-hosted fonts', () => {
  it('nothing imports next/font/google', () => {
    const src = ['app', 'components', 'lib'].flatMap((d) => walk(join(root, d))).filter((f) => /\.(t|j)sx?$/.test(f) && !f.includes('.test.'))
    expect(src.filter((f) => readFileSync(f, 'utf8').includes("from 'next/font/google'"))).toEqual([])
  })

  it('every file lib/fonts.ts names exists, with the OFL beside it', () => {
    const fonts = readFileSync(join(root, 'lib/fonts.ts'), 'utf8')
    const paths = Array.from(fonts.matchAll(/path: '\.\.\/(app\/fonts\/[^']+)'/g)).map((m) => m[1])
    expect(paths.length).toBe(6)
    for (const p of paths) expect(existsSync(join(root, p))).toBe(true)
    expect(existsSync(join(root, 'app/fonts/OFL-Archivo.txt'))).toBe(true)
    expect(existsSync(join(root, 'app/fonts/OFL-JetBrainsMono.txt'))).toBe(true)
  })
})
