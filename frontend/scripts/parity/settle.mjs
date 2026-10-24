#!/usr/bin/env node
/**
 * Concept A "Settle" (approved 24 Oct), checked in a browser at 1440 and 390.
 *
 *   node scripts/parity/settle.mjs [--base URL] [--out DIR] [--no-shots]
 *
 * Needs the frontend running (next dev or start) and nothing else: the API is
 * answered by fixtures (lib.mjs), /analysis never answers unless a check
 * releases it, /health answers or fails as the state needs. Time runs on
 * Playwright's clock. Exits 1 if any check fails.
 *
 *   geometry      the strip sits in the gutter, left of the title, inside the
 *                 title's height, never over a letter; no horizontal scroll;
 *                 the title starts at the same x in the skeleton and on the
 *                 arrived page (the strip takes no space); Retry is at least
 *                 44 px high
 *   motion        while waiting, exactly one infinite animation, on the strip's
 *                 accent band, changing opacity alone; every finite one moves
 *                 transform or opacity only
 *   reduced       with prefers-reduced-motion, no infinite animation at all
 *   arrival       the strip is gone as soon as the analysis is in
 *   rehearsal     a screenshot of each state (loading 3.2 s, computing 17 s,
 *                 waking 17 s, error 75 s) at both widths, in --out
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { playwright, installApi, newPage } from './lib.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3000')
const OUT = arg('--out', join(homedir(), '.pitwall-ui-baseline', 'settle'))
const SHOTS = !process.argv.includes('--no-shots')
const KEY = 9539
const T0 = new Date('2026-10-16T12:00:00Z').getTime()
const META = {
  session_key: KEY, meeting_key: 1238, meeting_name: 'Spanish Grand Prix', location: 'Barcelona',
  circuit_short_name: 'Catalunya', country_name: 'Spain', year: 2024, session_name: 'Race', session_type: 'Race',
  date_start: '2024-06-23T13:00:00+00:00', date_end: '2024-06-23T15:00:00+00:00', is_cancelled: false,
  analysis_cached: true, earliest_at: '2024-06-23T15:30:00+00:00',
}

const { chromium } = playwright()
const browser = await chromium.launch()
const failures = []
const check = (vp, name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${vp.padEnd(7)} ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures.push(`${vp} ${name}`)
}

/** A page on /race/KEY with the clock paused at T0; `health` true answers /health, false fails it. */
async function waiting(vp, { health = true, reducedMotion = false, gate = null } = {}) {
  const page = await newPage(browser, { viewport: vp, fixedTime: false, reducedMotion })
  await page.clock.install({ time: T0 })
  await page.clock.pauseAt(T0)
  await installApi(page, { override: async ({ path }) => {
    if (path === `/sessions/${KEY}/meta`) return { json: META }
    if (path === '/health') return health ? { json: { status: 'ok' } } : { abort: 'failed' }
    if (path === `/analysis/${KEY}`) { if (gate) { await gate; return null } return { hang: true } }
    return null
  } })
  await page.goto(`${BASE}/race/${KEY}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
  return page
}
const run = async (page, ms) => { await page.clock.runFor(ms); await page.waitForTimeout(400) }

const animations = (page) => page.evaluate(() => document.getAnimations().map((a) => {
  const t = a.effect?.getTiming?.() ?? {}
  const frames = a.effect?.getKeyframes?.() ?? []
  const props = [...new Set(frames.flatMap((f) => Object.keys(f).filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k))))]
  const el = a.effect?.target
  return { infinite: t.iterations === Infinity, props, strip: Boolean(el?.closest?.('[data-settle-strip]')), cls: String(el?.className ?? '') }
}))

for (const vp of ['desktop', 'mobile']) {
  const w = vp === 'desktop' ? 1440 : 390

  // ── geometry and motion while loading ──
  {
    const page = await waiting(vp)
    await run(page, 3200)
    const g = await page.evaluate(() => {
      const strip = document.querySelector('[data-settle-strip]')?.getBoundingClientRect()
      const h1 = document.querySelector('h1')
      const range = document.createRange(); range.selectNodeContents(h1)
      const text = [...range.getClientRects()].filter((r) => r.width > 0)
      const textLeft = Math.min(...text.map((r) => r.left))
      const h1Box = h1.getBoundingClientRect()
      const gutter = parseFloat(getComputedStyle(document.querySelector('header')).paddingLeft)
      return {
        strip: strip && { left: strip.left, right: strip.right, top: strip.top, bottom: strip.bottom, w: strip.width, h: strip.height },
        textLeft, h1Top: h1Box.top, h1Bottom: h1Box.bottom, h1Left: h1Box.left, gutter,
        overflowX: document.documentElement.scrollWidth - innerWidth,
      }
    })
    check(vp, 'strip drawn while loading', Boolean(g.strip) && g.strip.w > 0 && g.strip.h > 0, JSON.stringify(g.strip))
    if (g.strip) {
      check(vp, 'strip inside the gutter', g.strip.left >= -0.5 && g.strip.right <= g.gutter + 0.5, `x ${g.strip.left.toFixed(1)} to ${g.strip.right.toFixed(1)}, gutter ${g.gutter}`)
      check(vp, 'strip never over a letter', g.strip.right <= g.textLeft + 0.5, `strip right ${g.strip.right.toFixed(1)}, text left ${g.textLeft.toFixed(1)}`)
      check(vp, 'strip within the title height', g.strip.top >= g.h1Top - 0.5 && g.strip.bottom <= g.h1Bottom + 0.5)
    }
    check(vp, 'no horizontal scroll', g.overflowX <= 0, `${g.overflowX} px`)
    const anims = await animations(page)
    const loops = anims.filter((a) => a.infinite)
    check(vp, 'one loop, on the strip accent, opacity only',
      loops.length === 1 && loops[0].strip && loops[0].props.length === 1 && loops[0].props[0] === 'opacity', JSON.stringify(loops))
    const bad = anims.filter((a) => a.props.some((p) => p !== 'opacity' && p !== 'transform'))
    check(vp, 'every animation moves transform or opacity only', bad.length === 0, JSON.stringify(bad))
    if (SHOTS) { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: join(OUT, `loading-3.2s-${w}.png`) }) }
    globalThis[`h1Left_${vp}`] = g.h1Left
    await page.context().close()
  }

  // ── reduced motion ──
  {
    const page = await waiting(vp, { reducedMotion: true })
    await run(page, 3200)
    const loops = (await animations(page)).filter((a) => a.infinite)
    check(vp, 'reduced motion: nothing loops', loops.length === 0, JSON.stringify(loops))
    check(vp, 'reduced motion: strip still drawn', await page.locator('[data-settle-strip]').count() === 1)
    await page.context().close()
  }

  // ── the long waits and the error: rehearsal shots, Retry size ──
  for (const [name, health, ms] of [['computing-17s', true, 17_000], ['waking-17s', false, 17_000], ['error-75s', true, 75_000]]) {
    const page = await waiting(vp, { health })
    await run(page, 8_100)
    await run(page, ms - 8_100)
    const st = await page.locator('[data-state]').getAttribute('data-state')
    check(vp, `${name}: state ${st}`, st === name.split('-')[0])
    check(vp, `${name}: strip ${name.startsWith('error') ? 'dimmed' : 'drawn'}`, await page.locator(`[data-settle-strip="${name.startsWith('error') ? 'error' : name.startsWith('waking') ? 'waking' : 'loading'}"]`).count() === 1)
    if (name.startsWith('error')) {
      const box = await page.getByRole('button', { name: 'Retry' }).boundingBox()
      check(vp, 'Retry at least 44 px high', Boolean(box) && box.height >= 44, box ? `${box.height} px` : 'no button')
      const loops = (await animations(page)).filter((a) => a.infinite)
      check(vp, 'error: nothing loops', loops.length === 0, JSON.stringify(loops))
    }
    if (SHOTS) await page.screenshot({ path: join(OUT, `${name}-${w}.png`) })
    await page.context().close()
  }

  // ── arrival: the strip goes, the title does not move ──
  {
    let release
    const gate = new Promise((r) => { release = r })
    const page = await waiting(vp, { gate })
    await run(page, 3200)
    check(vp, 'strip before arrival', await page.locator('[data-settle-strip]').count() === 1)
    release()
    await page.waitForSelector('[data-skeleton="leaving"]', { timeout: 15000 })
    check(vp, 'strip gone at arrival', await page.locator('[data-settle-strip]').count() === 0)
    await page.clock.runFor(1000)
    await page.waitForSelector('[role="tablist"]', { timeout: 30000 })
    check(vp, 'strip gone after arrival', await page.locator('[data-settle-strip]').count() === 0)
    const left = await page.evaluate(() => document.querySelector('h1').getBoundingClientRect().left)
    check(vp, 'title x unchanged by arrival', Math.abs(left - globalThis[`h1Left_${vp}`]) < 0.5, `${globalThis[`h1Left_${vp}`]} to ${left}`)
    await page.context().close()
  }
}

await browser.close()
if (SHOTS) console.log(`rehearsal shots in ${OUT}`)
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
