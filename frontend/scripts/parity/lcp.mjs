#!/usr/bin/env node
/**
 * Largest Contentful Paint (and CLS) of a few routes, old build vs new, same
 * fixtures, CPU throttled 4× through CDP; median of N cold loads each.
 *
 *   node scripts/parity/lcp.mjs --old http://localhost:3100 --new http://localhost:3000 [--runs 7]
 */
import { playwright, installApi, newPage } from './lib.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BUILDS = { old: arg('--old', 'http://localhost:3100'), new: arg('--new', 'http://localhost:3000') }
const RUNS = Number(arg('--runs', '7'))
const ROUTES = (arg('--routes', '/,/race/9636')).split(',')

const { chromium } = playwright()
const browser = await chromium.launch()
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

async function measure(base, route) {
  const page = await newPage(browser, { fixedTime: false })
  await installApi(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.addInitScript(() => {
    window.__lcp = 0; window.__cls = 0
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto(base + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const r = await page.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls }))
  await page.context().close()
  return r
}

const out = {}
for (const route of ROUTES) {
  for (const [name, base] of Object.entries(BUILDS)) {
    const runs = []
    for (let i = 0; i < RUNS; i++) runs.push(await measure(base, route))
    out[`${route} ${name}`] = { lcp: Math.round(median(runs.map((r) => r.lcp))), cls: +median(runs.map((r) => r.cls)).toFixed(3) }
    console.log(`${route.padEnd(12)} ${name.padEnd(4)} LCP ${String(out[`${route} ${name}`].lcp).padStart(5)} ms  CLS ${out[`${route} ${name}`].cls}  (median of ${RUNS})`)
  }
}
await browser.close()
