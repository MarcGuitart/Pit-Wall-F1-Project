#!/usr/bin/env node
/**
 * Text parity: what a reader can see, dumped per view, old build vs new.
 *
 *   node scripts/parity/parity_diff.mjs --base http://localhost:3100 --out ~/.pitwall-ui-baseline/text-before.json
 *   node scripts/parity/parity_diff.mjs --base http://localhost:3000 --out ~/.pitwall-ui-baseline/text-after.json
 *   node scripts/parity/parity_diff.mjs --compare text-before.json text-after.json [--md report.md]
 *
 * For every scenario view in scenarios.mjs (desktop viewport) it records:
 *   lines  visible text, one entry per rendered line (innerText)
 *   svg    <text> inside charts and maps
 *   aria   aria-label / title attributes (tooltips, icon buttons)
 * then, on race pages, opens every collapsible it can find and every driver
 * card, recording each as its own view.
 *
 * --compare normalises case and whitespace (the new design may uppercase a
 * label through CSS) and reports, per view, the lines and the "atoms" —
 * numbers, lap times, driver codes — present before and missing after.
 * Atoms are what must never silently disappear.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { playwright, installApi, newPage, settle, misses, FIXTURES } from './lib.mjs'
import { SCENARIOS } from './scenarios.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }

// ── compare ──────────────────────────────────────────────────────────────────

const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase()
const ATOM = /(?<![\w.])(?:\d{1,2}:\d{2}\.\d{3}|[+-]?\d+(?:\.\d+)?%?s?|[A-Z]{3})(?![\w.])/g
function atomsOf(view) {
  const out = new Set()
  for (const s of [...view.lines, ...view.svg]) for (const m of s.matchAll(ATOM)) out.add(m[0].replace(/^\+/, ''))
  return out
}

if (process.argv.includes('--compare')) {
  const i = process.argv.indexOf('--compare')
  const before = JSON.parse(readFileSync(process.argv[i + 1], 'utf8'))
  const after = JSON.parse(readFileSync(process.argv[i + 2], 'utf8'))
  const md = []
  let missingViews = 0, missingLines = 0, missingAtoms = 0
  for (const [k, v] of Object.entries(before.views)) {
    const a = after.views[k]
    if (!a) { md.push(`### ${k}\n- **view missing in the new build**\n`); missingViews++; continue }
    const have = new Set([...a.lines, ...a.svg, ...a.aria].map(norm))
    const haveJoined = norm([...a.lines, ...a.svg, ...a.aria].join(' '))
    const lines = [...new Set(v.lines.map(norm))].filter((l) => l && !have.has(l) && !haveJoined.includes(l))
    const aAtoms = atomsOf(a)
    const atoms = [...atomsOf(v)].filter((x) => !aAtoms.has(x))
    if (lines.length || atoms.length) {
      md.push(`### ${k}`)
      if (atoms.length) md.push(`- atoms missing: ${atoms.map((x) => `\`${x}\``).join(' ')}`)
      for (const l of lines.slice(0, 60)) md.push(`- ${l}`)
      if (lines.length > 60) md.push(`- … ${lines.length - 60} more`)
      md.push('')
      missingLines += lines.length
      missingAtoms += atoms.length
    }
  }
  const head = `# Text parity\n\nbefore: ${before.base} (${Object.keys(before.views).length} views) · after: ${after.base} (${Object.keys(after.views).length} views)\n\n` +
    `Views missing: ${missingViews} · lines missing: ${missingLines} · atoms missing: ${missingAtoms}\n\n`
  const text = head + md.join('\n')
  const out = arg('--md', null)
  if (out) writeFileSync(out, text)
  console.log(out ? `${head.trim()}\n→ ${out}` : text)
  process.exit(0)
}

// ── dump ─────────────────────────────────────────────────────────────────────

const BASE = arg('--base', 'http://localhost:3100')
const OUT = arg('--out', 'text.json')
const ONLY = arg('--only', null)

async function capture(page) {
  return page.evaluate(() => {
    const seen = new Set()
    const lines = []
    for (const l of document.body.innerText.split('\n')) {
      const t = l.replace(/\s+/g, ' ').trim()
      if (t && !seen.has(t)) { seen.add(t); lines.push(t) }
    }
    const svg = [...new Set([...document.querySelectorAll('svg text')].map((t) => (t.textContent ?? '').trim()).filter(Boolean))]
    const aria = [...new Set([...document.querySelectorAll('[aria-label],[title]')]
      .map((e) => (e.getAttribute('aria-label') ?? e.getAttribute('title') ?? '').trim()).filter(Boolean))]
    return { lines, svg, aria }
  })
}

const EXPANDER = /^\W*(show|expand|more|full|see all|view all|all \d+|\+\s?\d+|details|methodology|why|how)/i
// The team-radio lane sits above the tabs: open its clips on the first view only.
const RADIO = /radio clip|^pre\b|^post\b/i

/** Something sits over the page (a modal, the chat overlay): the top bar is not what is on top. */
async function covered(page) {
  return page.evaluate(() => {
    const el = document.elementFromPoint(Math.round(innerWidth / 2), 8)
    return !el || !el.closest('header')
  }).catch(() => true)
}

/** A fresh page with the scenario's views up to `upTo` replayed. */
async function openAt(sc, upTo) {
  const page = await newPage(browser, { viewport: 'desktop', pro: sc.pro, fixedTime: sc.fixedTime !== false })
  await installApi(page, { override: sc.override })
  await page.goto(BASE + sc.path, { waitUntil: 'domcontentloaded' })
  await settle(page, 900)
  for (const v of sc.views.slice(0, upTo + 1)) if (v.act) await v.act(page)
  return page
}

const CLICKABLE = 'main button, main [role="button"], main summary'

/** Click every collapsible once; each opened state is its own view. */
async function expandAll(sc, i, key, views) {
  let page = await openAt(sc, i)
  const count = await page.locator(CLICKABLE).count()
  for (let n = 0; n < count; n++) {
    try {
      const h = page.locator(CLICKABLE).nth(n)
      if (!(await h.isVisible())) continue
      const label = ((await h.getAttribute('aria-label')) ?? (await h.innerText())).trim().replace(/\s+/g, ' ')
      const expanded = await h.getAttribute('aria-expanded')
      const isSummary = await h.evaluate((e) => e.tagName === 'SUMMARY')
      if (!(expanded === 'false' || EXPANDER.test(label) || isSummary || (i === 0 && RADIO.test(label)))) continue
      if (/back|close|clear|retry|redeem|sign out|remove|delete|^play|^pause/i.test(label)) continue
      await h.click({ timeout: 1500 })
      await page.waitForTimeout(350)
      views[`${key}+expand:${label.slice(0, 40)}`] = await capture(page)
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(150)
      if (await covered(page)) { await page.context().close(); page = await openAt(sc, i) }
    } catch { /* not clickable in this state */ }
  }
  await page.context().close()
}

function driverCodes(sessionKey) {
  try {
    const files = [`GET _analysis_${sessionKey}.json`, `GET _analysis_${sessionKey} [pro].json`]
    for (const f of files) {
      try {
        const fx = JSON.parse(readFileSync(join(FIXTURES, f), 'utf8'))
        return JSON.parse(fx.body).true_pace.map((r) => r.driver_code)
      } catch { /* next */ }
    }
  } catch { /* none */ }
  return []
}

const { chromium } = playwright()
const browser = await chromium.launch()
const result = { base: BASE, at: new Date().toISOString(), views: {}, failures: [] }

for (const sc of SCENARIOS) {
  if (ONLY && !sc.id.startsWith(ONLY)) continue
  if (sc.only && sc.only !== 'text') continue
  for (let i = 0; i < sc.views.length; i++) {
    const key = `${sc.id}/${sc.views[i].name}`
    let page
    try {
      page = await openAt(sc, i)
      result.views[key] = await capture(page)
    } catch (e) {
      result.failures.push({ view: key, error: String(e.message).split('\n')[0] })
    }
    await page?.context().close()
    if (sc.ok) await expandAll(sc, i, key, result.views).catch((e) => result.failures.push({ view: `${key}+expand`, error: String(e.message).split('\n')[0] }))
  }
  // Every driver card, opened from the Data View
  if (sc.ok) {
    const key = Number(sc.path.split('/').pop())
    let page = await openAt(sc, 0)
    await clickStrategyData(page)
    for (const code of driverCodes(key)) {
      const vk = `${sc.id}/driver-card:${code}`
      try {
        await page.getByText(code, { exact: true }).first().click({ timeout: 2000 })
        await page.waitForTimeout(350)
        result.views[vk] = await capture(page)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(200)
        if (await covered(page)) { await page.context().close(); page = await openAt(sc, 0); await clickStrategyData(page) }
      } catch (e) {
        result.failures.push({ view: vk, error: String(e.message).split('\n')[0] })
      }
    }
    await page.context().close()
  }
  process.stdout.write(`${sc.id} `)
}

async function clickStrategyData(page) {
  await page.getByRole('button', { name: /^\W*strategy/i }).first().click().catch(() => {})
  await page.waitForTimeout(300)
  await page.getByRole('tab', { name: /data view/i }).click().catch(() => {})
  await page.waitForTimeout(400)
}

await browser.close()
result.fixtureMisses = [...misses]
writeFileSync(OUT, JSON.stringify(result, null, 1))
console.log(`\n${Object.keys(result.views).length} views, ${result.failures.length} failures, ${result.fixtureMisses.length} fixture misses → ${OUT}`)
for (const f of result.failures) console.log('  FAIL', f.view, f.error)
