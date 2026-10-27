import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import nextConfig from '../next.config.mjs'

// /api/engineer-chat is gone and /preview/* goes home (before the 27 Oct deploy).
const ROOT = join(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = join(dir, name)
    if (statSync(join(ROOT, rel)).isDirectory()) return sources(rel)
    return /\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\./.test(name) ? [rel] : []
  })
}

describe('retired routes', () => {
  it('/api/engineer-chat no longer exists, nothing calls it, and no code reads an Anthropic key', () => {
    expect(existsSync(join(ROOT, 'app', 'api', 'engineer-chat'))).toBe(false)
    for (const f of [...sources('app'), ...sources('components'), ...sources('lib')]) {
      const text = readFileSync(join(ROOT, f), 'utf8')
      expect(text, f).not.toContain('/api/engineer-chat')
      expect(text, f).not.toContain('ANTHROPIC_API_KEY')
    }
  })

  it('/preview and everything under it redirect to "/", temporarily', async () => {
    const redirects = await (nextConfig as { redirects: () => Promise<{ source: string; destination: string; permanent: boolean }[]> }).redirects()
    expect(redirects).toEqual(expect.arrayContaining([
      { source: '/preview', destination: '/', permanent: false },
      { source: '/preview/:path*', destination: '/', permanent: false },
    ]))
  })
})
