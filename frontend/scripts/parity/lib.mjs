/**
 * Shared harness for the UI-migration parity scripts (see PARITY.md).
 *
 * Playwright is deliberately NOT a dependency of the frontend: it is loaded
 * from a separate install, PW_TOOLS (default ~/.pitwall-ui-tools), so
 * package.json stays as it is.
 *
 *   mkdir -p ~/.pitwall-ui-tools && cd ~/.pitwall-ui-tools
 *   npm i @playwright/test@1.63        # matches the cached chromium-1243
 *
 * The app under test is built with
 *   NEXT_PUBLIC_API_URL=http://pw-api.test      (never resolves: always intercepted)
 *   NEXT_PUBLIC_LIVE_URL=http://127.0.0.1:8099  (intercepted except on /live)
 * so every API answer comes from a fixture and the old and the new build see
 * byte-identical data. A fixture missing on disk is fetched once from BACKEND
 * (a real local backend, default http://127.0.0.1:8000) and saved; with
 * BACKEND=off a miss is reported and answered 599.
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

export const API_ORIGIN = 'http://pw-api.test'
export const LIVE_ORIGIN = 'http://127.0.0.1:8099'
export const BACKEND = process.env.BACKEND ?? 'http://127.0.0.1:8000'
export const FIXTURES = process.env.PARITY_FIXTURES ?? join(homedir(), '.pitwall-ui-baseline', 'fixtures')
/** "Today" for every deterministic scenario: countdowns and next-session copy read the clock. */
export const FIXED_NOW = process.env.PARITY_NOW ?? '2026-10-16T12:00:00Z'

export function playwright() {
  const tools = process.env.PW_TOOLS ?? join(homedir(), '.pitwall-ui-tools')
  const require = createRequire(join(tools, 'package.json'))
  return require('@playwright/test')
}

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
}

// ── fixtures ─────────────────────────────────────────────────────────────────

function fixtureName(method, url, pro, body) {
  const u = new URL(url)
  const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))
  const q = params.map(([k, v]) => `${k}=${v}`).join('&')
  let name = `${method} ${u.pathname}${q ? `?${q}` : ''}`
  if (pro) name += ' [pro]'
  // A POST is keyed on its body too, minus volatile fields
  if (body) name += ` #${createHash('sha1').update(body).digest('hex').slice(0, 10)}`
  return name.replace(/[^A-Za-z0-9._?=&,#\[\] -]/g, '_').replace(/\//g, '~') + '.json'
}

export const misses = new Set()

async function fromBackend(method, url, headers, body) {
  const target = BACKEND + new URL(url).pathname + new URL(url).search
  const res = await fetch(target, { method, headers, body: method === 'GET' ? undefined : body })
  const text = await res.text()
  return { status: res.status, contentType: res.headers.get('content-type') ?? 'application/json', body: text }
}

/**
 * Answer every request to API_ORIGIN (and the live server's /health) from
 * fixtures. `override(req)` may return {status, json|body, delayMs, abort}
 * to stage a state: an error, a slow answer, a module that failed.
 */
function silentWav(seconds = 1, rate = 8000) {
  const n = seconds * rate
  const b = Buffer.alloc(44 + n)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40)
  b.fill(128, 44)
  return b
}
const SILENCE = silentWav()

export async function installApi(page, { override, live = 'fixture', deadClips = [] } = {}) {
  mkdirSync(FIXTURES, { recursive: true })
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const req = route.request()
    const method = req.method()
    const url = req.url()
    const headers = req.headers()
    const pro = /^Bearer /.test(headers.authorization ?? '')
    const body = method === 'GET' ? null : (req.postData() ?? '')
    const o = override ? await override({ method, url, path: new URL(url).pathname, query: new URL(url).searchParams, pro, body }) : null
    if (o?.delayMs) await new Promise((r) => setTimeout(r, o.delayMs))
    if (o?.hang) return // never answered: the page sits in its loading state
    if (o?.abort) return route.abort(o.abort)
    if (o && (o.json !== undefined || o.body !== undefined)) {
      return route.fulfill({
        status: o.status ?? 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: o.json !== undefined ? JSON.stringify(o.json) : o.body,
      })
    }
    const file = join(FIXTURES, fixtureName(method, url, pro, body && o?.keyBody !== false ? body : null))
    let fx
    if (existsSync(file)) fx = JSON.parse(readFileSync(file, 'utf8'))
    else if (BACKEND !== 'off') {
      const fwd = { 'content-type': 'application/json', 'x-client-id': headers['x-client-id'] ?? 'parity' }
      if (headers.authorization) fwd.authorization = headers.authorization
      fx = await fromBackend(method, url, fwd, body)
      writeFileSync(file, JSON.stringify(fx))
    } else {
      misses.add(fixtureName(method, url, pro, body))
      fx = { status: 599, contentType: 'application/json', body: '{"error":{"code":"FIXTURE_MISSING","message":"no fixture"}}' }
    }
    const status = o?.status ?? fx.status
    let out = fx.body
    if (o?.transform) out = JSON.stringify(o.transform(JSON.parse(fx.body)))
    return route.fulfill({ status, contentType: fx.contentType, headers: { 'access-control-allow-origin': '*' }, body: out })
  })
  // Team-radio clips live on F1's CDN: serve one second of silence instead, so
  // a clip's state never depends on the network. deadClips are aborted.
  await page.route('https://livetiming.formula1.com/**', (route) => {
    if (deadClips.some((d) => route.request().url().includes(d))) return route.abort('failed')
    return route.fulfill({ status: 200, contentType: 'audio/wav', body: SILENCE })
  })
  if (live === 'abort') await page.route(`${LIVE_ORIGIN}/**`, (route) => route.abort('connectionrefused'))
  if (live === 'fixture') {
    // No live server in these scenarios: /health answers "nothing live".
    await page.route(`${LIVE_ORIGIN}/**`, (route) => route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ status: 'ok', session_key: null, live: false }),
    }))
  }
}

// ── PRO token ────────────────────────────────────────────────────────────────

const TOKEN_FILE = () => join(FIXTURES, '_pro_token.json')

/** A token from the local backend's test code, minted once and reused (fixtures are keyed on it being present). */
export async function proToken() {
  if (existsSync(TOKEN_FILE())) return JSON.parse(readFileSync(TOKEN_FILE(), 'utf8'))
  const res = await fetch(`${BACKEND}/access/redeem`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-client-id': 'parity' },
    body: JSON.stringify({ code: process.env.PRO_CODE ?? 'LOCALTEST' }),
  })
  if (!res.ok) throw new Error(`redeem failed: ${res.status} ${await res.text()}`)
  const b = await res.json()
  const t = { token: b.token, expires_at: b.expires_at }
  writeFileSync(TOKEN_FILE(), JSON.stringify(t))
  return t
}

export async function newPage(browser, { viewport = 'desktop', pro = false, fixedTime = true, reducedMotion = false, seenIntro = true } = {}) {
  const vp = VIEWPORTS[viewport]
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor ?? 1,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    acceptDownloads: true,
    locale: 'en-US', timezoneId: 'Europe/Madrid',
  })
  const tok = pro ? await proToken() : null
  await ctx.addInitScript(([tok, seenIntro]) => {
    try {
      localStorage.setItem('pwiq_client_id', 'parity-client')
      if (tok) {
        localStorage.setItem('pwiq_pro_token', tok.token)
        localStorage.setItem('pwiq_pro_expires_at', String(tok.expires_at))
      }
      if (seenIntro) sessionStorage.setItem('pwiq_intro_seen', '1')
    } catch { /* about:blank */ }
  }, [tok, seenIntro])
  const page = await ctx.newPage()
  if (fixedTime) await page.clock.setFixedTime(new Date(FIXED_NOW))
  return page
}

/** Let fonts, data and the 120-180 ms tab fades settle. */
export async function settle(page, ms = 600) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() => document.fonts?.ready).catch(() => {})
  await page.waitForTimeout(ms)
}
