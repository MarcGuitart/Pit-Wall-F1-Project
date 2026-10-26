#!/usr/bin/env node
/**
 * Block 27: the real heights of the analysis page's first screen, so the
 * loader's skeleton reserves exactly what arrives (no layout shift).
 *
 *   node scripts/parity/measure_analysis.mjs [--base http://localhost:3000] [--races 9636,9539,9566]
 *
 * Reports, per viewport and race, the top/height of the header, the timeline
 * band, the tabs and each first-level module of the Strategy tab.
 */
import { playwright, installApi, newPage, settle } from './lib.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3000')
const RACES = arg('--races', '9636,9539,9566').split(',')

const { chromium } = playwright()
const browser = await chromium.launch()
for (const vp of ['desktop', 'mobile']) {
  for (const key of RACES) {
    const page = await newPage(browser, { viewport: vp })
    await installApi(page)
    await page.goto(`${BASE}/race/${key}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[role="tablist"]', { timeout: 30000 })
    await settle(page, 800)
    const rows = await page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), h: Math.round(r.height), w: Math.round(r.width) } }
      const main = document.querySelector('main') ?? document.body
      const page = main.querySelector('[class*="page"]')
      const out = []
      for (const child of page.children) {
        const label = child.getAttribute('role') ?? child.tagName.toLowerCase() + '.' + (child.className || '').toString().split(' ')[0].split('_').slice(-2, -1)
        out.push({ part: label, ...box(child) })
        if (child.getAttribute('role') === 'tabpanel') {
          const tab = child.firstElementChild
          for (const m of tab.children) {
            out.push({ part: '  ' + m.tagName.toLowerCase() + ' ' + (m.querySelector('h2,h3,[class*="title"]')?.textContent?.slice(0, 24) ?? ''), ...box(m) })
            if (m.children.length > 1 && m.tagName === 'DIV' && !m.getAttribute('role')) {
              for (const n of m.children) out.push({ part: '    ' + (n.querySelector('h2,h3,[class*="title"]')?.textContent?.slice(0, 24) ?? n.tagName), ...box(n) })
            }
          }
        }
      }
      return out
    })
    console.log(`\n== ${vp} ${key}`)
    for (const r of rows) console.log(`${r.part.padEnd(40)} top ${String(r.top).padStart(5)}  h ${String(r.h).padStart(5)}  w ${r.w}`)
    await page.context().close()
  }
}
await browser.close()
