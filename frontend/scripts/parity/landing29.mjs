#!/usr/bin/env node
/**
 * Block 29 — the landing at "/", verified in a browser.
 *
 *   node scripts/parity/landing29.mjs shots [--base URL] [--out DIR]
 *   node scripts/parity/landing29.mjs geom  [--base URL]
 *   node scripts/parity/landing29.mjs cls   [--base URL] [--runs 5]
 *   node scripts/parity/landing29.mjs keys  [--base URL]   the FAQ by keyboard alone
 *
 * The islands' data comes from the contracts of ops/landing-meta, answered
 * here (STATS, live state); the calendar (/races, sessions) from the parity
 * fixtures. geom (Block 29 addendum): the top and height of every island and
 * of every section below the hero, while loading, once the data is in, and
 * once every island has given up (3 s timeout, nothing answers) — at 1440
 * and 390. The limit is 2 px of movement anywhere.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { playwright, installApi, newPage, LIVE_ORIGIN } from './lib.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const MODE = process.argv[2] ?? 'shots'
const BASE = arg('--base', 'http://localhost:3000')
const RUNS = Number(arg('--runs', '5'))
const OUT = arg('--out', join(homedir(), '.pitwall-ui-baseline', 'shots29'))

// GET /stats from the backend's own cache (ops/landing-meta), 2026-10-17.
const STATS = {
  sessions: 28, driver_laps: 27303, seasons: [2023, 2024, 2026], modules: 17,
  module_names: ['chaos', 'clean_air_value', 'crossover_windows', 'decisions', 'drs_trains', 'engineer_notes', 'pit_cycles', 'pit_impact', 'race_brain', 'race_classification', 'race_dna', 'race_phases', 'team_radio', 'true_pace', 'tyre_degradation', 'weather_analysis', 'weather_winners_losers'],
  analysis_version: '4', definitions: {},
}

const { chromium } = playwright()
const browser = await chromium.launch()

/** data: 'ok' (after delayMs) | 'hang' (never answers: islands time out). */
async function open(vp, { data = 'ok', delayMs = 0, live = { state: 'no_session', session_key: null }, init = null } = {}) {
  const page = await newPage(browser, { viewport: vp, fixedTime: false })
  if (init) await page.addInitScript(init)
  const calendar = (path) => path === '/races' || /^\/races\/\d+\/sessions$/.test(path)
  await installApi(page, {
    live: 'none',
    override: ({ path }) => {
      if (path === '/stats') return data === 'hang' ? { hang: true } : { delayMs, json: STATS }
      // The calendar is a chain (races, then sessions per meeting): 200 ms a link.
      if (calendar(path)) return data === 'hang' ? { hang: true } : { delayMs: Math.min(delayMs, 200) }
      return null
    },
  })
  await page.route(`${LIVE_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/live/state') {
      if (data === 'hang') return // never answered
      await new Promise((r) => setTimeout(r, delayMs))
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(live) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, session_key: null }) })
  })
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  return page
}

async function geometry(page) {
  return page.evaluate(() => {
    const out = {}
    const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.top + scrollY), Math.round(b.height)] }
    document.querySelectorAll('[data-island]').forEach((el) => { out[`island:${el.getAttribute('data-island')}`] = [...r(el), el.getAttribute('data-state')] })
    const page = document.querySelector('main > div > div') ?? document.querySelector('main')
    ;[...page.children].forEach((el, i) => { out[`block${String(i).padStart(2, '0')}:${el.id || el.tagName.toLowerCase()}`] = r(el) })
    const footer = document.querySelector('footer'); if (footer) out['footer'] = r(footer)
    out.__vh = innerHeight
    return out
  })
}

function compare(a, b) {
  let worst = 0, worstVisible = 0, where = ''
  for (const k of Object.keys(a)) {
    if (k === '__vh' || !b[k]) continue
    const d = Math.max(Math.abs(a[k][0] - b[k][0]), Math.abs(a[k][1] - b[k][1]))
    if (d > worst) { worst = d; where = k }
    if (a[k][0] < a.__vh && d > worstVisible) worstVisible = d
  }
  return { worst, worstVisible, where }
}

if (MODE === 'geom') {
  for (const vp of ['desktop', 'mobile']) {
    // With data: loading at ~300 ms, data in at 1.5 s, measured at 2.5 s.
    let page = await open(vp, { data: 'ok', delayMs: 1500 })
    await page.waitForTimeout(300)
    const loading = await geometry(page)
    await page.waitForTimeout(2500)
    const ok = await geometry(page)
    await page.context().close()
    // Without: nothing answers; every island gives up at 3 s.
    page = await open(vp, { data: 'hang' })
    await page.waitForTimeout(300)
    const loading2 = await geometry(page)
    await page.waitForTimeout(3700)
    const failed = await geometry(page)
    await page.context().close()
    const states = (g) => Object.entries(g).filter(([k]) => k.startsWith('island:')).map(([k, v]) => `${k.slice(7)}=${v[2]}`).join(' ')
    const c1 = compare(loading, ok), c2 = compare(loading2, failed)
    console.log(`${vp.padEnd(8)} data    ${states(loading)} → ${states(ok)}  worst ${c1.worst} px (${c1.where || '—'}), in first screen ${c1.worstVisible} px`)
    console.log(`${vp.padEnd(8)} timeout ${states(loading2)} → ${states(failed)}  worst ${c2.worst} px (${c2.where || '—'}), in first screen ${c2.worstVisible} px`)
  }
}

if (MODE === 'keys') {
  const page = await open('desktop')
  await page.waitForTimeout(1500)
  const q = page.locator('#faq button').nth(1)
  await q.focus()
  const before = await q.getAttribute('aria-expanded')
  await page.keyboard.press('Enter')
  const afterEnter = await q.getAttribute('aria-expanded')
  const visible = await page.locator('#faq-1').isVisible()
  await page.keyboard.press('Space')
  const afterSpace = await q.getAttribute('aria-expanded')
  await page.keyboard.press('Tab')
  const next = await page.evaluate(() => document.activeElement?.textContent?.trim())
  console.log(`FAQ by keyboard: ${before} → Enter ${afterEnter} (answer visible ${visible}) → Space ${afterSpace}; Tab moves to "${next}"`)
  await page.context().close()
  if (!(before === 'false' && afterEnter === 'true' && visible && afterSpace === 'false')) process.exitCode = 1
}

if (MODE === 'cls') {
  for (const vp of ['desktop', 'mobile']) {
    const runs = []
    for (let i = 0; i < RUNS; i++) {
      const p2 = await open(vp, { data: 'ok', delayMs: 800, init: () => {
        window.__cls = 0; window.__lcp = 0
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true })
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
      } })
      await p2.waitForTimeout(3000)
      runs.push(await p2.evaluate(() => ({ cls: window.__cls ?? 0, lcp: window.__lcp ?? 0 })))
      await p2.context().close()
    }
    const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    console.log(`${vp.padEnd(8)} CLS ${med(runs.map((r) => r.cls)).toFixed(4)}  LCP ${Math.round(med(runs.map((r) => r.lcp)))} ms (median of ${RUNS}, islands answering at 800 ms)`)
  }
}

if (MODE === 'shots') {
  mkdirSync(OUT, { recursive: true })
  for (const vp of ['desktop', 'mobile']) {
    const w = vp === 'desktop' ? 1440 : 390
    let page = await open(vp)
    await page.waitForTimeout(2500)
    await page.screenshot({ path: join(OUT, `landing-${w}.png`), fullPage: true })
    await page.context().close()
    for (const [name, live] of [['live', { state: 'live', session_key: 11377 }]]) {
      page = await open(vp, { live })
      await page.waitForTimeout(2500)
      await page.locator('#live').screenshot({ path: join(OUT, `livecard-${name}-${w}.png`) })
      await page.context().close()
    }
    page = await open(vp, { data: 'hang' })
    await page.waitForTimeout(3800)
    await page.screenshot({ path: join(OUT, `landing-timeout-${w}.png`), fullPage: true })
    await page.context().close()
    console.log('  ', w)
  }
}
await browser.close()
