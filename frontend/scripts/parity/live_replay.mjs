#!/usr/bin/env node
/**
 * /live against the Baku recording, before and after a shell change.
 *
 *   BAKU_CAPTURE=…/backend/live/2026-09-26_race_11377 \
 *   PY=~/.pitwall-ui-tools/venv/bin/python LIVE_ENV=~/.pitwall-ui-tools/local.env \
 *   node scripts/parity/live_replay.mjs --base http://localhost:3100 --out DIR
 *
 * Starts scripts/live_server.py --replay-capture on :8099 (killed at the end),
 * opens /live/11377 as a PRO reader at 1440 and 390 px at the same moment and
 * screenshots both at fixed replay times, so two builds are compared at the
 * same point of the race. The live server needs the API's PRO_TOKEN_SECRET to
 * accept the token: LIVE_ENV is the same local-only env file the backend runs
 * with (never in the repo).
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { playwright, installApi, newPage, LIVE_ORIGIN } from './lib.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3100')
const OUT = arg('--out', 'live-shots')
const SPEED = arg('--speed', '30')
const AT = (arg('--at', '20,45,75')).split(',').map(Number) // seconds after the page opens
const BACKEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../backend')
mkdirSync(OUT, { recursive: true })

const env = { ...process.env }
for (const line of readFileSync(process.env.LIVE_ENV, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const server = spawn(process.env.PY ?? 'python3', ['scripts/live_server.py', '--replay-capture', process.env.BAKU_CAPTURE, '--speed', SPEED, '--session-type', 'Race', '--port', '8099'], { cwd: BACKEND_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
server.stdout.on('data', (d) => { log += d })
server.stderr.on('data', (d) => { log += d })
const stop = () => { try { server.kill('SIGTERM') } catch { /* gone */ } }
process.on('exit', stop)

for (let i = 0; i < 120; i++) {
  try { if ((await fetch(`${LIVE_ORIGIN}/health`)).ok) break } catch { /* not yet */ }
  await new Promise((r) => setTimeout(r, 500))
}

const { chromium } = playwright()
const browser = await chromium.launch()
const pages = {}
for (const vp of ['desktop', 'mobile']) {
  const p = await newPage(browser, { viewport: vp, pro: true, fixedTime: false })
  await installApi(p, { live: 'real' })
  pages[vp] = p
}
const t0 = Date.now()
await Promise.all(Object.values(pages).map((p) => p.goto(`${BASE}/live/11377`, { waitUntil: 'domcontentloaded' })))
for (const at of AT) {
  const wait = t0 + at * 1000 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  for (const [vp, p] of Object.entries(pages)) {
    await p.screenshot({ path: join(OUT, `live-11377__t${at}s__${vp}.png`), fullPage: true })
  }
  process.stdout.write(`t=${at}s `)
}
await browser.close()
stop()
console.log(`\n→ ${OUT}`)
if (!/Uvicorn running|Application startup/.test(log)) console.log(log.slice(-2000))
