import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** Block 42: the build says which commit it is, in a meta tag and /version.json, and nothing more. */
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('build stamp', () => {
  it('/version.json is the commit and its short form, static', async () => {
    vi.stubEnv('NEXT_PUBLIC_PW_BUILD', 'aedf67cfac9116426e702e49e4951fe961f8d073')
    const route = await import('../app/version.json/route')
    expect(route.dynamic).toBe('force-static')
    const body = await route.GET().json()
    expect(body).toEqual({ commit: 'aedf67cfac9116426e702e49e4951fe961f8d073', short: 'aedf67c' })
  })

  it('falls back to "local" outside Netlify', async () => {
    vi.stubEnv('NEXT_PUBLIC_PW_BUILD', '')
    const { BUILD_COMMIT } = await import('./build')
    expect(BUILD_COMMIT).toBe('local')
  })

  it('the layout puts it in <meta name="pw-build">', async () => {
    vi.stubEnv('NEXT_PUBLIC_PW_BUILD', 'abc1234')
    const { metadata } = await import('../app/layout')
    expect((metadata.other as Record<string, string>)['pw-build']).toBe('abc1234')
  })

  it('next.config inlines Netlify\'s COMMIT_REF at build time', () => {
    expect(readFileSync(join(__dirname, '../next.config.mjs'), 'utf8')).toMatch(/NEXT_PUBLIC_PW_BUILD:\s*process\.env\.COMMIT_REF/)
  })
})
