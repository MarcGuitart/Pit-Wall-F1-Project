import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Concept A "Settle" (approved 24 Oct): the loader's motion contract, read from the stylesheet itself.
// jsdom computes no animations, so the rules are checked where they are written; the browser check
// (scripts/parity/settle.mjs) measures the same things on a running page.
const css = readFileSync(path.join(__dirname, 'skeleton.module.css'), 'utf8')
const tokens = readFileSync(path.join(__dirname, '..', '..', 'ui', 'ui.module.css'), 'utf8')

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const body = stripComments(css)
/** Top-level and nested rules as [selector, declarations], @keyframes excluded. */
function rules(src: string): [string, string][] {
  const out: [string, string][] = []
  const re = /([^{}@]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) out.push([m[1].trim(), m[2]])
  return out
}
const keyframes = (src: string) => Array.from(src.matchAll(/@keyframes\s+(\w+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g), (m) => ({ name: m[1], body: m[2] }))
const reduced = (() => {
  const i = body.indexOf('@media (prefers-reduced-motion: reduce)')
  const start = body.indexOf('{', i) + 1
  let depth = 1, j = start
  while (depth && j < body.length) { if (body[j] === '{') depth++; if (body[j] === '}') depth--; j++ }
  return body.slice(start, j - 1)
})()
const outsideReduced = body.replace(reduced, '')

describe('motion: only the strip loops, and only opacity and transform move', () => {
  it('the one infinite animation is the accent band of the strip', () => {
    const looping = rules(outsideReduced).filter(([, d]) => /infinite/.test(d)).map(([sel]) => sel)
    expect(looping).toEqual(['.waiting .stripAccent'])
  })

  it('its keyframes change opacity alone', () => {
    const settle = keyframes(body).find((k) => k.name === 'pwSettle')!
    expect(settle.body.replace(/\s+/g, ' ').trim()).toBe('50% { opacity: 0.45; }')
  })

  it('every keyframe and transition animates transform or opacity only', () => {
    for (const k of keyframes(body)) {
      const props = Array.from(k.body.matchAll(/([a-z-]+)\s*:/g), (m) => m[1])
      expect(props.every((p) => p === 'opacity' || p === 'transform'), `@keyframes ${k.name}: ${props}`).toBe(true)
    }
    for (const [sel, d] of rules(body)) {
      const t = /(?:^|;)\s*transition\s*:\s*([^;]+)/.exec(d)?.[1]
      if (!t || t.trim() === 'none') continue
      const props = t.split(',').map((x) => x.trim().split(/\s+/)[0])
      expect(props.every((p) => p === 'opacity' || p === 'transform'), `${sel}: ${t}`).toBe(true)
    }
  })

  it('nothing else of the old loader loops: no breathing bars, no pulsing dot, no time rule', () => {
    expect(body).not.toMatch(/pwBreathe|pwDot|\.breathe|\.dotLive|\.rule(Grey|Accent)?\b/)
  })

  it('stops while the tab is hidden and in the error state', () => {
    expect(rules(body).some(([sel, d]) => sel === '.paused .stripAccent' && /animation-play-state:\s*paused/.test(d))).toBe(true)
    expect(rules(body).some(([sel, d]) => sel === '.error .stripAccent' && /animation:\s*none/.test(d))).toBe(true)
  })
})

describe('reduced motion', () => {
  it('the strip stands still and the facts only fade, in 120 ms', () => {
    const r = rules(reduced)
    expect(r.some(([sel, d]) => sel === '.waiting .stripAccent' && /animation:\s*none/.test(d))).toBe(true)
    expect(r.some(([sel, d]) => sel.includes('.waiting .headLeftWrap') && /pwFade 120ms/.test(d))).toBe(true)
    expect(reduced).not.toMatch(/translate|infinite/)
  })
})

describe('the strip takes no space and uses the accent token', () => {
  it('is placed absolutely against the title, clipped to the gutter', () => {
    const strip = rules(body).find(([sel]) => sel === '.strip')?.[1] ?? ''
    expect(strip).toMatch(/position:\s*absolute/)
    expect(strip).toMatch(/right:\s*100%/)
    expect(strip).toMatch(/width:\s*var\(--pw-gutter\)/)
    expect(strip).toMatch(/overflow:\s*hidden/)
  })

  it('is skewed like the sweep, -22 degrees', () => {
    const band = rules(body).find(([sel]) => sel === '.stripAccent, .stripGrey')![1]
    expect(band).toMatch(/transform:\s*skewX\(-22deg\)/)
  })

  it('the accent is var(--pw-accent), and that token is #ec3013 on every ground', () => {
    expect(rules(body).find(([sel]) => sel === '.stripAccent')![1]).toMatch(/background:\s*var\(--pw-accent\)/)
    const values = Array.from(tokens.matchAll(/--pw-accent:\s*([^;]+);/g), (m) => m[1].trim().toLowerCase())
    expect(values.length).toBeGreaterThan(0)
    expect(new Set(values)).toEqual(new Set(['#ec3013']))
  })
})
