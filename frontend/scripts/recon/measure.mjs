#!/usr/bin/env node
/**
 * Recon Lap measurements against `next start` builds.
 *
 *   node scripts/recon/measure.mjs <task> [--base http://localhost:3210] [--ref http://localhost:3201] [--slug interlagos] [--out DIR]
 *
 *   still    public/recon/<slug>-still.webp, rendered by the scene itself (cwebp)
 *   weights  gzip bytes: /recon/<slug> on first load and after the scene, the 3D chunk, data; /races vs the reference build
 *   fps      1440×810 DPR 2 and 2560×1440 DPR 2, bloom on and off, CPU ×1 and ×4
 *   video    15 s at 1440×810 (H.264)
 *   shots    390 px: the scene, the still (reduced motion, slow 3G), the /races panel with its link
 *
 * Playwright from PW_TOOLS (~/.pitwall-ui-tools); Chromium on ANGLE/Metal (the real GPU).
 */
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const require = createRequire(join(process.env.PW_TOOLS ?? join(homedir(), '.pitwall-ui-tools'), 'package.json'))
const { chromium } = require('@playwright/test')
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const TASK = process.argv[2]
const BASE = arg('--base', 'http://localhost:3210')
const REF = arg('--ref', 'http://localhost:3201')
const SLUG = arg('--slug', 'interlagos')
const OUT = arg('--out', 'out-recon')
mkdirSync(OUT, { recursive: true })
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const kb = (b) => Math.round(b / 102.4) / 10
const launch = () => chromium.launch({ args: GPU })
const ready = (page, n = 20) => page.waitForFunction((k) => (window.__pw3d?.frames ?? 0) > k, n, { timeout: 30000 })

async function still() {
  const b = await launch()
  const page = await b.newPage({ viewport: { width: 1600, height: 1200 } })
  await page.goto(`${BASE}/recon/${SLUG}?force3d&pose=still&bloom=1`, { waitUntil: 'load' })
  await ready(page, 30); await sleep(1200)
  await page.locator('canvas').screenshot({ path: join(OUT, `${SLUG}-still.png`) })
  await b.close()
  execFileSync('cwebp', ['-quiet', '-q', '78', '-resize', '1600', '0', join(OUT, `${SLUG}-still.png`), '-o', join('public/recon', `${SLUG}-still.webp`)])
  console.log(`public/recon/${SLUG}-still.webp written`)
}

async function visit(b, url, ms, act) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  const reqs = new Map()
  let phase = 'load'
  cdp.on('Network.responseReceived', (e) => reqs.set(e.requestId, { url: e.response.url, type: e.type, bytes: 0, phase }))
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength })
  await page.goto(url, { waitUntil: 'load' })
  await sleep(1500)
  phase = 'after'
  if (act) await act(page)
  await sleep(ms)
  await ctx.close()
  return [...reqs.values()]
}

async function weights() {
  const b = await launch()
  const sum = (rs, f) => kb(rs.filter(f).reduce((a, r) => a + r.bytes, 0))
  const rows = []
  const recon = await visit(b, `${BASE}/recon/${SLUG}?bloom=1`, 4000)
  const js = (r) => r.type === 'Script'
  rows.push({ page: `/recon/${SLUG}`, 'JS first load': sum(recon, (r) => js(r) && r.phase === 'load'), 'JS after (3D)': sum(recon, (r) => js(r) && r.phase === 'after'),
    data: sum(recon, (r) => r.url.includes('/recon/') && r.url.endsWith('.json')), image: sum(recon, (r) => r.type === 'Image'), html: sum(recon, (r) => r.type === 'Document') })
  const chunks = recon.filter((r) => js(r) && r.phase === 'after').map((r) => `${r.url.split('/').pop()} ${kb(r.bytes)} KB`)
  for (const [name, base] of [['/races (this build)', BASE], ['/races (release/nov01)', REF], ['/ (this build)', BASE], ['/ (release/nov01)', REF]]) {
    const path = name.startsWith('/races') ? '/races' : '/'
    const rs = await visit(b, base + path, 2500)
    rows.push({ page: name, 'JS first load': sum(rs, js), 'JS after (3D)': 0, data: 0, image: sum(rs, (r) => r.type === 'Image'), html: sum(rs, (r) => r.type === 'Document') })
  }
  await b.close()
  console.table(rows)
  console.log('3D chunks:', chunks.join(', '))
  writeFileSync(join(OUT, 'weights.json'), JSON.stringify({ rows, chunks }, null, 2))
}

async function fps() {
  const b = await launch()
  const rows = []
  for (const [vw, vh] of [[1440, 810], [2560, 1440]]) {
    for (const bloom of [1, 0]) {
      for (const cpu of [1, 4]) {
        const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 })
        const page = await ctx.newPage()
        const cdp = await ctx.newCDPSession(page)
        if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
        await page.goto(`${BASE}/recon/${SLUG}?bloom=${bloom}&nofallback`, { waitUntil: 'load' })
        await page.locator('canvas').scrollIntoViewIfNeeded()
        await ready(page, 5); await sleep(2500)
        await page.evaluate(() => { window.__iv = []; let last = performance.now(); const f = (t) => { window.__iv.push(t - last); last = t; requestAnimationFrame(f) }; requestAnimationFrame(f) })
        const f0 = await page.evaluate(() => window.__pw3d.frames), t0 = Date.now()
        await sleep(5000)
        const f1 = await page.evaluate(() => window.__pw3d.frames)
        const st = await page.evaluate(() => ({ dpr: window.__pw3d.dpr, bloom: window.__pw3d.bloom, w: document.querySelector('canvas').width, h: document.querySelector('canvas').height }))
        const iv = (await page.evaluate(() => window.__iv)).slice(2).sort((a, c) => a - c)
        rows.push({ viewport: `${vw}×${vh}`, canvas: `${st.w}×${st.h}`, bloom: bloom ? 'on' : 'off', cpu: `×${cpu}`, fps: Math.round(((f1 - f0) * 10000) / (Date.now() - t0)) / 10, p95ms: Math.round(iv[Math.floor(iv.length * 0.95)] * 10) / 10 })
        await ctx.close()
      }
    }
  }
  await b.close()
  console.table(rows)
  writeFileSync(join(OUT, 'fps.json'), JSON.stringify(rows, null, 2))
}

async function video() {
  const b = await launch()
  const page = await b.newPage({ viewport: { width: 1440, height: 810 } })
  const cdp = await page.context().newCDPSession(page)
  await page.goto(`${BASE}/recon/${SLUG}`, { waitUntil: 'load' })
  await page.locator('canvas').scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollTo(0, document.querySelector('canvas').getBoundingClientRect().top + scrollY - 20))
  await ready(page)
  const dir = join(OUT, 'frames'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  const ts = []
  cdp.on('Page.screencastFrame', (f) => { writeFileSync(join(dir, `${String(ts.length).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64')); ts.push(f.metadata.timestamp); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}) })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1440, maxHeight: 810 })
  await sleep(15500)
  await cdp.send('Page.stopScreencast'); await sleep(300)
  // frames can arrive out of order: sort by their own timestamps
  const order = ts.map((t, i) => ({ t, i })).sort((a, c) => a.t - c.t)
  const lines = order.flatMap((f, k) => [`file '${String(f.i).padStart(5, '0')}.jpg'`, `duration ${Math.max(0.001, (order[k + 1]?.t ?? f.t + 1 / 30) - f.t).toFixed(4)}`])
  writeFileSync(join(dir, 'list.txt'), lines.join('\n'))
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-t', '15', '-vf', 'scale=1440:810:force_original_aspect_ratio=decrease,pad=1440:810:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', join(OUT, `recon-${SLUG}.mp4`)])
  rmSync(dir, { recursive: true, force: true })
  await b.close()
  console.log(`recon-${SLUG}.mp4 (${ts.length} frames)`)
}

async function shots() {
  const b = await launch()
  const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
  for (const [name, o] of [['recon-390', {}], ['recon-reduced-390', { reducedMotion: 'reduce' }], ['recon-slow3g-390', { slow: true }]]) {
    const ctx = await b.newContext({ ...PHONE, reducedMotion: o.reducedMotion })
    const page = await ctx.newPage()
    if (o.slow) { const c = await ctx.newCDPSession(page); await c.send('Network.enable'); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50000, uploadThroughput: 50000, connectionType: 'cellular3g' }) }
    await page.goto(`${BASE}/recon/${SLUG}`, { waitUntil: 'load', timeout: 120000 })
    if (!o.reducedMotion && !o.slow) { await page.locator('canvas').scrollIntoViewIfNeeded(); await ready(page); await sleep(4000); await page.evaluate(() => window.scrollTo(0, 0)) } else await sleep(o.slow ? 6000 : 1500)
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true })
    await ctx.close()
  }
  await b.close(); return
  // /races, the 2026 season, the São Paulo panel open with its link (calendar from the API when it answers)
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/races`, { waitUntil: 'load' })
  await sleep(2500)
  const cell = page.getByRole('button', { name: /São Paulo/ }).first()
  if (await cell.count()) { await cell.click(); await sleep(1500); await page.locator('[role=region]').first().screenshot({ path: join(OUT, 'races-panel.png') }) }
  else console.log('races: no São Paulo cell (calendar did not load)')
  await ctx.close()
  await b.close()
}

const tasks = { still, weights, fps, video, shots }
if (!tasks[TASK]) { console.error(`task: ${Object.keys(tasks).join(' | ')}`); process.exit(1) }
await tasks[TASK]()
