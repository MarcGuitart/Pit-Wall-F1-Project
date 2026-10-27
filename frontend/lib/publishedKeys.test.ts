import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PUBLISHED_ROOT, publishedSessionKeys } from './publishedKeys'
import * as layout from '@/app/race/[sessionKey]/layout'

describe('block 41: the race shells built at build time', () => {
  it('lists the session directories with an _analysis.json, in key order', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pw-published-'))
    for (const [k, analysed] of [[9636, true], [11377, true], [9539, false], [42, true]] as const) {
      mkdirSync(path.join(root, String(k)))
      if (analysed) writeFileSync(path.join(root, String(k), '_analysis.json'), '{}')
    }
    mkdirSync(path.join(root, 'fastf1'))
    writeFileSync(path.join(root, 'meetings_2024.json'), '[]')
    expect(publishedSessionKeys(root)).toEqual([42, 9636, 11377])
  })

  it('a missing directory gives no shells, not a failed build', () => {
    expect(publishedSessionKeys('/nonexistent/pw')).toEqual([])
  })

  it('reads the repo: the default root is backend/cache, and it has published races', () => {
    expect(PUBLISHED_ROOT.endsWith(path.join('backend', 'cache'))).toBe(true)
    const keys = publishedSessionKeys()
    expect(keys).toEqual(expect.arrayContaining([9539, 9636]))   // Barcelona and São Paulo 2024
  })

  it('the layout builds those keys and keeps every other key rendering on demand', () => {
    expect(layout.dynamicParams).toBe(true)
    const params = layout.generateStaticParams()
    expect(params.length).toBe(publishedSessionKeys().length)
    expect(params).toContainEqual({ sessionKey: '9636' })
  })
})
