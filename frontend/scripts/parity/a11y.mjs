#!/usr/bin/env node
/**
 * Basic keyboard and contrast checks (phase 9), old build vs new.
 *
 *   node scripts/parity/a11y.mjs --old http://localhost:3100 --new http://localhost:3000
 *
 * axe-core (from the same separate install as Playwright, PW_TOOLS) on a few
 * pages at 1440 and 390 px, reporting serious/critical violations and the
 * colour-contrast rule on its own; then a keyboard pass on each page: Tab
 * through the first 40 stops and count the ones with no visible focus
 * indicator (no outline, no box-shadow change).
 */
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { playwright, installApi, newPage, settle } from './lib.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BUILDS = { old: arg('--old', 'http://localhost:3100'), new: arg('--new', 'http://localhost:3000') }
const PAGES = ['/', '/race/9636', '/settings', '/docs']
const tools = process.env.PW_TOOLS ?? join(homedir(), '.pitwall-ui-tools')
const axePath = createRequire(join(tools, 'package.json')).resolve('axe-core/axe.min.js')

const { chromium } = playwright()
const browser = await chromium.launch()

for (const path of PAGES) {
  for (const vp of ['desktop', 'mobile']) {
    const line = []
    for (const [name, base] of Object.entries(BUILDS)) {
      const page = await newPage(browser, { viewport: vp })
      await installApi(page)
      await page.goto(base + path, { waitUntil: 'domcontentloaded' })
      await settle(page, 1200)
      await page.addScriptTag({ path: axePath })
      const res = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await axe.run(document, { resultTypes: ['violations'] })
        const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        const contrast = r.violations.find((v) => v.id === 'color-contrast')
        return { serious: bad.map((v) => `${v.id}×${v.nodes.length}`), contrast: contrast ? contrast.nodes.length : 0 }
      })
      let noFocus = 0, stops = 0
      if (vp === 'desktop') {
        for (let i = 0; i < 40; i++) {
          await page.keyboard.press('Tab')
          const f = await page.evaluate(() => {
            const el = document.activeElement
            if (!el || el === document.body) return null
            const cs = getComputedStyle(el)
            const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none')
            return { visible }
          })
          if (!f) continue
          stops++
          if (!f.visible) noFocus++
        }
      }
      line.push(`${name}: contrast ${String(res.contrast).padStart(3)} · serious ${res.serious.join(' ') || '—'}${vp === 'desktop' ? ` · focus missing ${noFocus}/${stops}` : ''}`)
      await page.context().close()
    }
    console.log(`${path.padEnd(12)} ${vp.padEnd(8)} ${line.join('  |  ')}`)
  }
}
await browser.close()
