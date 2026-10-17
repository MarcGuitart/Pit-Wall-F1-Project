#!/usr/bin/env node
/**
 * Phase 9 interaction checks against a build (fixtures as in screens.mjs;
 * a local backend records anything missing — BACKEND=off to forbid it).
 *
 *   node scripts/parity/interactions.mjs --base http://localhost:3000
 *
 * Prints PASS/FAIL per check and exits non-zero if any failed.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { playwright, installApi, newPage, settle, FIXTURES } from './lib.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3000')
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`) }

const { chromium } = playwright()
const browser = await chromium.launch()

async function open(path, opts = {}) {
  const page = await newPage(browser, { pro: opts.pro, viewport: opts.viewport, fixedTime: opts.fixedTime ?? true })
  await installApi(page, { override: opts.override, deadClips: opts.deadClips ?? [] })
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await settle(page, 900)
  return page
}
async function tab(page, label) {
  await page.getByRole('button', { name: new RegExp(`^\\W*${label}`, 'i') }).first().click()
  await page.waitForTimeout(500)
}
async function run(name, fn) {
  try { await fn() } catch (e) { check(name, false, String(e.message).split('\n')[0]) }
}

// ── telemetry replay ─────────────────────────────────────────────────────────
await run('telemetry', async () => {
  const p = await open('/race/9636')
  await tab(p, 'Telemetry')
  const map = p.locator('section[aria-label="Circuit map"]')
  const play = map.getByRole('button', { name: 'Play', exact: true })
  await play.waitFor({ timeout: 15000 })
  const slider = p.getByRole('slider', { name: 'Lap position' })
  const val = async () => Number(await slider.getAttribute('aria-valuenow'))
  check('replay: starts at 0', (await val()) === 0)
  await play.click()
  await p.waitForTimeout(1500)
  const moving = await val()
  check('replay: play advances the lap', moving > 0, `at ${moving}%`)
  await map.getByRole('button', { name: 'Pause', exact: true }).click()
  const paused = await val()
  await p.waitForTimeout(600)
  check('replay: pause holds the position', (await val()) === paused, `${paused}%`)
  await slider.focus()
  await p.keyboard.press('End')
  check('replay: End scrubs to the end', (await val()) === 100)
  await p.keyboard.press('Home')
  check('replay: Home scrubs to the start', (await val()) === 0)
  for (let i = 0; i < 10; i++) await p.keyboard.press('ArrowRight')
  check('replay: arrows step 1 %', (await val()) === 10)
  const box = await slider.boundingBox()
  await p.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2)
  const mid = await val()
  check('replay: pointer scrub', mid >= 45 && mid <= 55, `${mid}%`)
  const speed = p.getByRole('button', { name: /playback speed 1×/i })
  await speed.click()
  check('replay: speed cycles 1× → 2×', await p.getByRole('button', { name: /playback speed 2×/i }).count() === 1)
  // compare: a second driver
  const chips = p.getByRole('group', { name: 'Drivers to compare' }).getByRole('button')
  const second = chips.nth(1)
  await second.click()
  await p.waitForTimeout(300)
  check('replay: second driver joins the comparison', (await second.getAttribute('aria-pressed')) === 'true')
  check('replay: multi-driver note appears', await p.getByText(/Multi-driver: team colours/).count() === 1)
  // lap mode
  await p.getByRole('radio', { name: 'Representative' }).click()
  await p.getByText('Loading Telemetry').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {})
  await p.waitForTimeout(500)
  await p.locator('section[aria-label="Circuit map"]').getByRole('button', { name: 'Play', exact: true }).waitFor({ timeout: 20000 }).catch(() => {})
  check('replay: representative lap loads', await p.getByRole('radio', { name: 'Representative', checked: true }).count() === 1 && await p.getByText('Telemetry Unavailable').count() === 0)
  await p.context().close()
})

// ── race engineer chat ───────────────────────────────────────────────────────
async function openChat(p) {
  await p.getByRole('button', { name: /engineer/i }).first().click()
  await p.getByRole('dialog', { name: 'Race engineer' }).waitFor()
  await p.getByRole('textbox', { name: /question for the race engineer/i }).waitFor({ timeout: 6000 })
}
async function ask(p, q) {
  const box = p.getByRole('textbox', { name: /question for the race engineer/i })
  await box.fill(q)
  const answered = p.waitForResponse((r) => new URL(r.url()).pathname === '/chat' && r.request().method() === 'POST', { timeout: 300000 })
  await box.press('Enter')
  await answered
  await p.waitForTimeout(800)
}
await run('chat', async () => {
  const p = await open('/race/9636')
  await openChat(p)
  await ask(p, 'Who had the best race pace?')
  const text = await p.getByRole('dialog', { name: 'Race engineer' }).innerText()
  check('chat: sends and shows the answer', /VER/.test(text) && /Race Engineer/i.test(text))
  check('chat: shows confidence', /(Low|Medium|High) confidence|Unverified/.test(text))
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
  check('chat: Escape closes it', await p.getByRole('dialog', { name: 'Race engineer' }).count() === 0)
  await p.context().close()
})
await run('chat-cited', async () => {
  const p = await open('/race/9636', {
    override: (r) => r.path === '/chat' && r.method === 'POST' ? { json: {
      answer: 'Lap 27 was the pivot.', cited_signals: [{ id: 'S4', lap_number: 27, title: 'HAM pitted under SC/VSC — L27' }, { id: 'S2', lap_number: 27, title: 'BEA slow stop L27' }],
      confidence: 'High', declared_confidence: 'High', provider: 'ollama', model: 'llama3.1:8b' } } : null,
  })
  await openChat(p)
  await ask(p, 'Where was the race won?')
  const text = await p.getByRole('dialog', { name: 'Race engineer' }).innerText()
  check('chat: citations listed with their laps', /L27 · HAM pitted under SC\/VSC — L27/.test(text) && /L27 · BEA slow stop L27/.test(text))
  check('chat: confidence follows the citations', /High confidence/.test(text))
  await p.context().close()
})
await run('chat-rate-limit', async () => {
  const p = await open('/race/9636', {
    override: (r) => r.path === '/chat' ? { status: 429, json: { error: { code: 'RATE_LIMITED', message: 'Message limit reached.', details: { retry_after_seconds: 540 } } } } : null,
  })
  await openChat(p)
  await ask(p, 'Who had the best race pace?')
  const box = p.getByRole('textbox', { name: /question for the race engineer/i })
  check('chat: rate limit disables the composer', await box.isDisabled())
  check('chat: rate limit shows the countdown', await p.getByText(/Rate limited · try again in 9m/).count() === 1)
  await p.context().close()
})

// ── driver card radios: one at a time, dead clip ─────────────────────────────
await run('radios', async () => {
  const fx = JSON.parse(readFileSync(join(FIXTURES, 'GET _analysis_9636.json'), 'utf8'))
  const a = JSON.parse(fx.body)
  const counts = {}
  for (const c of a.team_radio.clips) counts[c.driver_code] = (counts[c.driver_code] ?? 0) + 1
  const [code] = Object.entries(counts).sort((x, y) => y[1] - x[1])[0]
  const clips = a.team_radio.clips.filter((c) => c.driver_code === code)
  const dead = clips[2]?.recording_url ?? clips.at(-1).recording_url
  const p = await open('/race/9636', { deadClips: [dead.split('/').pop()] })
  await p.getByRole('tab', { name: /data view/i }).click()
  await p.waitForTimeout(300)
  await p.getByText(code, { exact: true }).first().click()
  const card = p.getByRole('dialog', { name: new RegExp(`${code} — driver card`) })
  await card.waitFor()
  const players = card.getByTestId('radio-clip')
  check(`radios: ${code}'s card lists its clips`, await players.count() === clips.length, `${await players.count()}/${clips.length}`)
  await players.nth(0).getByRole('button', { name: 'Play' }).click()
  await p.waitForTimeout(250)
  await players.nth(1).getByRole('button', { name: 'Play' }).click()
  await p.waitForTimeout(250)
  const paused = await card.evaluate((el) => [...el.querySelectorAll('audio')].map((au) => au.paused))
  check('radios: only one clip plays at a time', paused.filter((x) => !x).length === 1 && paused[0] === true, JSON.stringify(paused.slice(0, 3)))
  await p.waitForTimeout(1200)
  check('radios: a dead clip says so', await card.getByText(/Recording unavailable — the F1 archive no longer serves this file/).count() >= 1)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(250)
  check('radios: Escape closes the card', await card.count() === 0)
  await p.context().close()
})

// ── selector ─────────────────────────────────────────────────────────────────
await run('selector', async () => {
  const p = await open('/')
  await p.getByRole('combobox', { name: /grand prix/i }).waitFor()
  await p.waitForTimeout(800)
  await p.getByRole('combobox', { name: /grand prix/i }).click()
  await p.getByRole('option', { name: /Brazilian Grand Prix|São Paulo Grand Prix/ }).first().click()
  await p.getByRole('button', { name: /^race$/i }).waitFor({ timeout: 10000 })
  check('selector: the race session is preselected', (await p.getByRole('button', { name: /^race$/i }).getAttribute('aria-pressed')) === 'true')
  await p.getByRole('button', { name: /analyze race/i }).click()
  await p.waitForURL(/\/race\/\d+/, { timeout: 15000 })
  check('selector: Analyze opens the race', /\/race\/9636/.test(p.url()), p.url())
  await p.context().close()

  const g = await open('/')
  await g.getByRole('button', { name: /^Round \d+ · .*Interlagos/ }).click()
  await g.waitForURL(/\/race\/\d+/, { timeout: 15000 })
  check('season grid: a cell opens its race', /\/race\/9636/.test(g.url()), g.url())
  await g.context().close()
})

// ── settings: redeem, toggle, sign out ───────────────────────────────────────
await run('settings', async () => {
  const p = await open('/settings')
  const sw = p.getByRole('switch')
  await sw.click()
  const input = p.getByLabel('Access code')
  await input.fill('NOT-A-CODE')
  await p.getByRole('button', { name: 'Unlock' }).click()
  await p.getByText(/That code is not valid/).waitFor({ timeout: 10000 }).catch(() => {})
  check('settings: a wrong code is refused', await p.getByText(/That code is not valid/).count() === 1)
  await input.fill(process.env.PRO_CODE ?? 'LOCALTEST')
  await p.getByRole('button', { name: 'Unlock' }).click()
  await p.getByText('PRO access active').first().waitFor({ timeout: 10000 })
  check('settings: a valid code unlocks PRO', true)
  check('settings: top bar shows the PRO badge', await p.getByLabel(/PRO access active — open Settings/).count() === 1)
  await p.getByRole('switch').click()
  await p.waitForTimeout(300)
  check('settings: the toggle hides the badge without signing out', await p.getByLabel(/PRO access active — open Settings/).count() === 0 && await p.getByText(/Your access code is still active/).count() === 1)
  await p.getByRole('button', { name: 'Sign out of PRO' }).click()
  await p.waitForTimeout(300)
  check('settings: sign out returns to the free state', await p.getByText(/Turn this on to enter an access code/).count() === 1)
  await p.context().close()
})

// ── .ics download ────────────────────────────────────────────────────────────
await run('ics', async () => {
  const p = await open('/', { pro: true })
  await p.getByRole('button', { name: /no session live right now/i }).click()
  const dl = p.waitForEvent('download', { timeout: 10000 })
  await p.getByRole('dialog').getByRole('button', { name: /add to calendar/i }).click()
  const d = await dl
  const path = await d.path()
  const body = readFileSync(path, 'utf8')
  check('.ics: the popover downloads a calendar file', /\.ics$/.test(d.suggestedFilename()) && /BEGIN:VEVENT/.test(body), d.suggestedFilename())
  await p.context().close()
})

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
