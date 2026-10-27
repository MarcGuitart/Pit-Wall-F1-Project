#!/usr/bin/env node
/**
 * Screenshot matrix: every scenario × view × viewport (1440 and 390 px).
 *
 *   node scripts/parity/screens.mjs --base http://localhost:3100 --out ~/.pitwall-ui-baseline/screens/before
 *   node scripts/parity/screens.mjs --base http://localhost:3000 --out …/after --only race-9636
 *
 * Writes <out>/<scenario>__<view>__<viewport>.png and <out>/_report.json
 * (failed steps, console errors, fixture misses).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { playwright, installApi, newPage, settle, misses } from './lib.mjs'
import { SCENARIOS } from './scenarios.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3100')
const OUT = arg('--out', 'screens')
const ONLY = arg('--only', null)
const VPS = (arg('--viewports', 'desktop,mobile')).split(',')

mkdirSync(OUT, { recursive: true })
const { chromium } = playwright()
const browser = await chromium.launch()
const report = { base: BASE, at: new Date().toISOString(), shots: 0, failures: [], consoleErrors: [] }

for (const sc of SCENARIOS) {
  if (ONLY && !sc.id.startsWith(ONLY)) continue
  if (sc.only && sc.only !== 'screens') continue
  for (const vp of VPS) {
    const page = await newPage(browser, { viewport: vp, pro: sc.pro, fixedTime: sc.fixedTime !== false, seenIntro: sc.seenIntro !== false })
    page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(`${sc.id}/${vp}: ${m.text().slice(0, 200)}`) })
    await installApi(page, { override: sc.override })
    try {
      await page.goto(BASE + sc.path, { waitUntil: 'domcontentloaded' })
      if (sc.settleMs != null) await page.waitForTimeout(sc.settleMs)
      else await settle(page, 900)
      for (const v of sc.views) {
        if (v.desktopOnly && vp !== 'desktop') continue
        try {
          if (v.act) await v.act(page)
          await page.screenshot({ path: join(OUT, `${sc.id}__${v.name}__${vp}.png`), fullPage: true, animations: 'disabled' })
          report.shots++
        } catch (e) {
          report.failures.push({ scenario: sc.id, view: v.name, viewport: vp, error: String(e.message).split('\n')[0] })
        }
      }
    } catch (e) {
      report.failures.push({ scenario: sc.id, viewport: vp, error: String(e.message).split('\n')[0] })
    }
    await page.context().close()
  }
  process.stdout.write(`${sc.id} `)
}
await browser.close()
report.fixtureMisses = [...misses]
writeFileSync(join(OUT, '_report.json'), JSON.stringify(report, null, 2))
console.log(`\n${report.shots} shots, ${report.failures.length} failed steps, ${report.fixtureMisses.length} fixture misses → ${OUT}`)
for (const f of report.failures) console.log('  FAIL', f.scenario, f.view ?? '', f.viewport, f.error)
