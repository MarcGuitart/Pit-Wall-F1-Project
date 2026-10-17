#!/usr/bin/env node
/**
 * Block 27 — the loading experience, verified in a browser.
 *
 *   node scripts/parity/loading27.mjs cls   [--base URL] [--runs 5]   CLS/LCP with /analysis taking 3.2 s
 *   node scripts/parity/loading27.mjs shots [--base URL] [--out DIR]  every state at 1440 and 390
 *
 * Fixtures as in the rest of scripts/parity (lib.mjs). /sessions/{key}/meta is
 * answered from META below — the contract of ops/loading-meta — so neither
 * mode depends on that backend being deployed. States are driven by
 * Playwright's clock (paused at navigation, then run forward); arrival frames
 * are taken by pausing every running animation and seeking it.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { playwright, installApi, newPage } from './lib.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const MODE = process.argv[2] ?? 'cls'
const BASE = arg('--base', 'http://localhost:3000')
const RUNS = Number(arg('--runs', '5'))
const OUT = arg('--out', join(homedir(), '.pitwall-ui-baseline', 'shots27'))
const KEY = 9539
const T0 = new Date('2026-10-16T12:00:00Z').getTime()

const META = {
  session_key: KEY, meeting_key: 1238, meeting_name: 'Spanish Grand Prix', location: 'Barcelona',
  circuit_short_name: 'Catalunya', country_name: 'Spain', year: 2024, session_name: 'Race', session_type: 'Race',
  date_start: '2024-06-23T13:00:00+00:00', date_end: '2024-06-23T15:00:00+00:00', is_cancelled: false,
  analysis_cached: true, earliest_at: '2024-06-23T15:30:00+00:00',
}
const metaFor = (extra = {}) => ({ ...META, ...extra })

const { chromium } = playwright()
const browser = await chromium.launch()
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

/** override for installApi: meta from META, /analysis as `analysis` says. */
function api({ analysis = {}, meta = {} } = {}) {
  return ({ path }) => {
    if (path === `/sessions/${KEY}/meta`) return meta.status ? { status: meta.status, json: meta.json } : { json: metaFor(meta.extra) }
    if (path === `/analysis/${KEY}`) return analysis
    return null
  }
}

if (MODE === 'cls') {
  for (const vp of ['desktop', 'mobile']) {
    const runs = []
    for (let i = 0; i < RUNS; i++) {
      const page = await newPage(browser, { viewport: vp, fixedTime: false })
      await installApi(page, { override: api({ analysis: { delayMs: 3200 } }) })
      await page.addInitScript(() => {
        window.__cls = 0; window.__lcp = 0; window.__shifts = []
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push([Math.round(e.startTime), +e.value.toFixed(4)]) } }).observe({ type: 'layout-shift', buffered: true })
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
      })
      await page.goto(`${BASE}/race/${KEY}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('[role="tablist"]', { timeout: 30000 })
      await page.waitForTimeout(1500)
      runs.push(await page.evaluate(() => ({ cls: window.__cls, lcp: window.__lcp, shifts: window.__shifts })))
      await page.context().close()
    }
    const m = median(runs.map((r) => r.cls))
    console.log(`${vp.padEnd(8)} CLS ${m.toFixed(4)}  LCP ${Math.round(median(runs.map((r) => r.lcp)))} ms  (median of ${RUNS}; shifts in run 1: ${JSON.stringify(runs[0].shifts)})`)
  }
}

if (MODE === 'shots') {
  mkdirSync(OUT, { recursive: true })
  const shot = async (page, name) => { await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false }); console.log('  ', name) }
  for (const vp of ['desktop', 'mobile']) {
    const w = vp === 'desktop' ? 1440 : 390
    // States 1–4: /analysis never answers; time runs on the page's clock.
    for (const t of [0.1, 3.2, 17, 45]) {
      const page = await newPage(browser, { viewport: vp, fixedTime: false })
      await page.clock.install({ time: T0 })
      await page.clock.pauseAt(T0)
      await installApi(page, { override: api({ analysis: { hang: true } }) })
      await page.goto(`${BASE}/race/${KEY}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(400)
      await page.clock.runFor(Math.round(t * 1000))
      await page.waitForTimeout(500)
      // Settle the finite entries (shell fade, status rise); the breathing loops keep running.
      await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish() } catch { /* infinite */ } }))
      await shot(page, `state-t${t}-${w}`)
      await page.context().close()
    }
    // Arrival: answer at 3.2 s, then freeze the crossfade at 60, 180 and 400 ms.
    for (const ms of [60, 180, 400]) {
      const page = await newPage(browser, { viewport: vp, fixedTime: false })
      await page.clock.install({ time: T0 })
      await page.clock.pauseAt(T0)
      let release
      const gate = new Promise((r) => { release = r })
      await installApi(page, { override: async ({ path }) => {
        if (path === `/analysis/${KEY}`) { await gate; return null }
        return api()({ path })
      } })
      await page.goto(`${BASE}/race/${KEY}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(400)
      await page.clock.runFor(3200)
      await page.waitForTimeout(300)
      release()
      await page.waitForSelector('[data-skeleton="leaving"]', { timeout: 15000 })
      await page.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t }), ms)
      await page.waitForTimeout(200)
      await shot(page, `arrival-${ms}ms-${w}`)
      await page.context().close()
    }
    // Pages with no analysis.
    const blocked = {
      unpublished: { status: 425, json: { error: { code: 'SESSION_NOT_HISTORICAL_YET', message: 'live window', details: { unlock_at_utc: '2026-10-19T19:30:00+00:00', retry_after_minutes: 30 } } } },
      pro: { status: 402, json: { error: { code: 'PRO_REQUIRED', message: 'pro', details: { year: 2026 } } } },
      cancelled: { status: 410, json: { error: { code: 'SESSION_CANCELLED', message: 'cancelled', details: { session_key: KEY, source: 'openf1' } } } },
      rate: { status: 429, json: { error: { code: 'OPENF1_RATE_LIMIT', message: 'slow', details: { endpoint: 'laps', attempts: 4, retry_after_seconds: 38 } } } },
    }
    for (const [name, a] of Object.entries(blocked)) {
      const page = await newPage(browser, { viewport: vp, fixedTime: false })
      await installApi(page, { override: api({ analysis: a }) })
      await page.goto(`${BASE}/race/${KEY}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('[data-blocked]', { timeout: 15000 })
      await page.waitForTimeout(400)
      await shot(page, `blocked-${name}-${w}`)
      await page.context().close()
    }
    {
      const page = await newPage(browser, { viewport: vp, fixedTime: false })
      await installApi(page, { override: api({ analysis: { hang: true }, meta: { status: 404, json: { error: { code: 'SESSION_NOT_FOUND', message: 'no such session', details: null } } } }) })
      await page.goto(`${BASE}/race/${KEY}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('[data-blocked]', { timeout: 15000 })
      await page.waitForTimeout(400)
      await shot(page, `blocked-notfound-${w}`)
      await page.context().close()
    }
  }
}
await browser.close()
