#!/usr/bin/env node
/**
 * What does a reader see while /analysis is in flight? Samples the page every
 * 100 ms in a real browser and prints a timeline per case.
 *
 *   node scripts/parity/diagnose_loading.mjs --base http://localhost:3100 [--shots DIR]
 *
 * Cases (all /race/9636 against fixtures, nothing hits a real backend):
 *   cold     /analysis answers after 7.5 s   (cache miss after force_refresh)
 *   warm     /analysis answers after 150 ms  (cache hit)
 *   asleep   /analysis answers after 30 s    (Render free tier waking)
 *   dead     /analysis answers after 60 s    (past the 45 s limit)
 *   pro402   PRO_REQUIRED
 *   live425  SESSION_NOT_HISTORICAL_YET
 *   nav-*    the same, reached by clicking a featured race on the landing
 *            (client navigation), with the Next server slow to answer the
 *            route's RSC request (a cold serverless function)
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { playwright, installApi, newPage } from './lib.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3100')
const SHOTS = arg('--shots', null)
const ONLY = arg('--only', null)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const err = (status, code, message, details = null) => ({ status, json: { error: { code, message, details } } })
const CASES = [
  { id: 'warm', delay: 150, until: 2500 },
  { id: 'cold', delay: 7500, until: 9500 },
  { id: 'asleep', delay: 30000, until: 31500, coarse: true },
  { id: 'dead', delay: 60000, until: 47000, coarse: true },
  { id: 'pro402', ov: err(402, 'PRO_REQUIRED', 'This race is part of PRO.', { year: 2026 }), until: 2000 },
  { id: 'live425', ov: err(425, 'SESSION_NOT_HISTORICAL_YET', 'This session may still be inside OpenF1\'s live window.', { unlock_at_utc: '2026-10-16T13:45:00+00:00', retry_after_minutes: 105 }), until: 2000 },
  { id: 'nav-warm-rsc3s', nav: true, rscDelay: 3000, delay: 150, until: 5000 },
  { id: 'nav-cold-rsc3s', nav: true, rscDelay: 3000, delay: 7500, until: 12000 },
]

/** One line describing the screen: which of the known states is up, and the first words of <main>. */
function describe() {
  const main = document.querySelector('main')
  const text = (main?.innerText ?? '').replace(/\s+/g, ' ').trim()
  const has = (re) => re.test(text)
  const state =
    !main ? 'NO <main>'
      : has(/waking up the analysis server/i) ? 'loader: waking'
      : has(/building (the )?race report|loading the race/i) ? 'loader'
      : has(/no answer from the analysis server|did not answer/i) ? 'timeout error + retry'
      : has(/pro required|part of pro|access code/i) ? 'pro wall'
      : has(/live window|unlock|available in/i) ? 'unavailable (425)'
      : has(/race brain|true pace|strategy view/i) ? 'analysis'
      : location.pathname === '/' && !document.querySelector('main [aria-busy="true"]') ? 'still on the landing'
      : text.length === 0 ? (document.querySelector('[aria-busy="true"]') ? 'shell only (grace)' : 'EMPTY main')
      : 'other'
  const r = main?.getBoundingClientRect()
  return { state, text: text.slice(0, 70), mainH: Math.round(r?.height ?? 0), path: location.pathname }
}

const { chromium } = playwright()
const browser = await chromium.launch()
for (const c of CASES) {
  if (ONLY && !c.id.startsWith(ONLY)) continue
  const page = await newPage(browser, { fixedTime: false })
  await installApi(page, {
    override: (r) => r.path === '/analysis/9636'
      ? (c.ov ?? { delayMs: c.delay })
      : null,
  })
  if (c.rscDelay) {
    await page.route((u) => u.pathname.startsWith('/race/') , async (route) => {
      if (route.request().headers()['rsc'] === '1') await new Promise((r) => setTimeout(r, c.rscDelay))
      await route.continue()
    })
  }
  const samples = []
  const t0 = Date.now()
  let lastKey = ''
  const tick = async () => {
    try {
      const d = await page.evaluate(describe)
      const key = `${d.state}|${d.path}`
      if (key !== lastKey) { samples.push({ t: Date.now() - t0, ...d }); lastKey = key }
    } catch { /* navigating */ }
  }
  if (c.nav) {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const t1 = Date.now()
    await page.getByText('Brazilian Grand Prix', { exact: false }).first().click()
    samples.push({ t: Date.now() - t0, state: `click on featured card (+${Date.now() - t1} ms)`, text: '', mainH: 0, path: '/' })
  } else {
    page.goto(BASE + '/race/9636').catch(() => {})
  }
  const shotsAt = [100, 1000, 3200, c.delay ? c.delay + 200 : 1500]
  while (Date.now() - t0 < c.until) {
    await tick()
    const t = Date.now() - t0
    if (SHOTS && shotsAt.length && t >= shotsAt[0]) {
      shotsAt.shift()
      await page.screenshot({ path: join(SHOTS, `${c.id}__t${t}.png`) }).catch(() => {})
    }
    await page.waitForTimeout(c.coarse ? 500 : 100)
  }
  console.log(`\n## ${c.id}`)
  for (const s of samples) console.log(`  ${String(s.t).padStart(6)} ms  ${s.state.padEnd(22)} ${s.path.padEnd(12)} h=${String(s.mainH).padEnd(5)} ${s.text}`)
  await page.context().close()
}
await browser.close()
