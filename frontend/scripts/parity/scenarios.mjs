/**
 * The parity matrix: every route and state the migration must keep.
 *
 * A scenario is a page load plus a list of views. Each view is an action
 * (click a tab, open a card…) after which screens.mjs takes a screenshot and
 * parity_diff.mjs dumps the visible text. Actions find things by role and
 * visible label, never by class or DOM shape, so the same script drives the
 * old and the new UI — a label the new UI loses makes the step fail loudly.
 *
 * Sessions: 9636 São Paulo 2024 (wet, red flag, SC, telemetry), 9539 Spain
 * 2024, 11377 Baku 2026 (PRO, no telemetry), 11240 China 2026 Sprint (PRO,
 * no telemetry). No qualifying or practice analysis is cached; see PARITY.md.
 */

const err = (status, code, message, details = null) => ({ status, json: { error: { code, message, details } } })

const TABS = ['Strategy', 'Tyre & Pit', 'Lap charts', 'Weather', 'Telemetry', 'Race Control']

async function clickTab(page, label) {
  await page.getByRole('button', { name: new RegExp(`^\\W*${label.replace(/[&]/g, '\\$&')}`, 'i') }).first().click()
  await page.waitForTimeout(500)
}

/** Overwrite modules on a recorded analysis: field → null and modules[field] = {status, reason}. */
function withModules(state, fields) {
  return (a) => {
    const out = structuredClone(a)
    out.modules = { ...(out.modules ?? {}) }
    for (const [f, reason] of Object.entries(fields)) {
      out.modules[f] = { status: state, reason }
      if (f === 'race_phases' || f === 'crossover_windows') out[f] = []
      else out[f] = null
    }
    return out
  }
}

const FAILED = {
  race_dna: 'DNA classifier raised on an empty stint table',
  race_phases: 'phase segmentation found no lap boundaries',
  drs_trains: 'interval data missing for 12 of 20 drivers',
  clean_air_value: 'too few clean-air laps to compare',
  weather_analysis: 'weather feed returned no rows',
  weather_winners_losers: 'crossover table was empty',
}
const NOT_APPLICABLE = {
  race_dna: 'Race DNA needs a full race distance.',
  race_phases: 'No phase changes in this session.',
  drs_trains: 'DRS was disabled for the whole race.',
  clean_air_value: 'No traffic to compare against.',
  weather_analysis: 'Dry race with stable conditions.',
  weather_winners_losers: 'No position changes attributable to crossover timing.',
}

const analysisOf = (key) => ({ path }) => path === `/analysis/${key}`

function raceViews({ telemetry = true } = {}) {
  const v = [{ name: 'strategy' }]
  v.push({ name: 'strategy-data-view', act: (p) => p.getByRole('tab', { name: /data view/i }).click().then(() => p.waitForTimeout(400)) })
  v.push({ name: 'strategy-back', act: (p) => p.getByRole('tab', { name: /strategy view/i }).click().then(() => p.waitForTimeout(400)) })
  for (const t of TABS.slice(1)) {
    v.push({ name: `tab-${t.toLowerCase().replace(/\W+/g, '-')}`, act: (p) => clickTab(p, t).then(() => t === 'Telemetry' && telemetry ? p.waitForTimeout(2500) : t === 'Lap charts' ? p.waitForTimeout(1200) : null) })
  }
  v.push({ name: 'control-tables', act: (p) => p.getByRole('button', { name: /open tables/i }).click().then(() => p.waitForTimeout(400)) })
  return v
}

export const SESSIONS = { wet: 9636, std: 9539, pro: 11377, sprint: 11240 }

export const SCENARIOS = [
  // ── landing, docs, settings ───────────────────────────────────────────────
  { id: 'landing', path: '/', views: [{ name: 'top' }] },
  { id: 'landing-intro', path: '/', seenIntro: false, settleMs: 300, views: [{ name: 'intro-playing' }], textOnly: false, only: 'screens' },
  { id: 'landing-pro', path: '/', pro: true, views: [
    { name: 'top' },
    // The old build opens the tip on hover, the new one on click: try hover, then click.
    { name: 'live-popover', desktopOnly: true, act: async (p) => {
      const t = p.getByLabel(/live mode/i).first()
      await t.hover(); await p.waitForTimeout(300)
      if (!(await p.getByText(/^no live session right now$/i).count())) { await t.click(); await p.waitForTimeout(300) }
    } },
  ] },
  { id: 'docs', path: '/docs', views: [{ name: 'top' }] },
  { id: 'settings', path: '/settings', views: [{ name: 'top' }] },
  { id: 'settings-pro', path: '/settings', pro: true, views: [{ name: 'top' }] },
  { id: 'not-found', path: '/no-such-page', views: [{ name: 'top' }] },

  // ── race pages, ok ───────────────────────────────────────────────────────
  { id: 'race-9636', path: '/race/9636', ok: true, views: raceViews() },
  { id: 'race-9539', path: '/race/9539', ok: true, views: raceViews() },
  { id: 'race-11377-pro', path: '/race/11377', ok: true, pro: true, views: raceViews({ telemetry: false }) },
  { id: 'race-11240-pro', path: '/race/11240', ok: true, pro: true, views: raceViews({ telemetry: false }) },

  // ── module states ────────────────────────────────────────────────────────
  ...['failed', 'not_applicable'].map((state) => ({
    id: `race-9636-modules-${state}`, path: '/race/9636',
    override: (r) => analysisOf(9636)(r) ? { transform: withModules(state, state === 'failed' ? FAILED : NOT_APPLICABLE) } : null,
    views: [{ name: 'strategy' }, { name: 'tyre-pit', act: (p) => clickTab(p, 'Tyre & Pit') }, { name: 'weather', act: (p) => clickTab(p, 'Weather') }],
  })),

  // ── loading ──────────────────────────────────────────────────────────────
  { id: 'race-loading', path: '/race/9636', fixedTime: false, settleMs: 1500, override: (r) => analysisOf(9636)(r) ? { hang: true } : null, views: [{ name: 'at-1.5s' }, { name: 'at-10s', act: (p) => p.waitForTimeout(8500) }], only: 'screens' },

  // ── error states ─────────────────────────────────────────────────────────
  { id: 'race-402', path: '/race/11377', views: [{ name: 'wall' }] },
  { id: 'race-425', path: '/race/9636', override: (r) => analysisOf(9636)(r) ? err(425, 'SESSION_NOT_HISTORICAL_YET', 'This session may still be inside OpenF1\'s live window. Historical data should become available approximately 30 minutes after the session ends.', { unlock_at_utc: '2026-10-16T13:45:00+00:00', retry_after_minutes: 105 }) : null, views: [{ name: 'countdown' }] },
  { id: 'race-425-no-unlock', path: '/race/9636', override: (r) => analysisOf(9636)(r) ? err(425, 'SESSION_NOT_HISTORICAL_YET', 'No session metadata or lap data found. This session may not yet be available in OpenF1. Historical data typically becomes available 30 minutes after the session ends.', { unlock_at_utc: null, retry_after_minutes: 30 }) : null, views: [{ name: 'no-unlock' }] },
  { id: 'race-404', path: '/race/9636', override: (r) => analysisOf(9636)(r) ? err(404, 'SESSION_NOT_CACHED', 'Session 9636 is not in the demo cache.', null) : null, views: [{ name: 'not-cached' }] },
  { id: 'race-429', path: '/race/9636', override: (r) => analysisOf(9636)(r) ? err(429, 'OPENF1_RATE_LIMIT', 'OpenF1 is rate-limiting requests. Retry in a minute.', { retry_after_minutes: 2 }) : null, views: [{ name: 'rate-limit' }] },
  { id: 'race-503', path: '/race/9636', override: (r) => analysisOf(9636)(r) ? err(503, 'OPENF1_ERROR', 'OpenF1 unreachable while fetching laps.', null) : null, views: [{ name: 'openf1-down' }] },
  { id: 'race-500', path: '/race/9636', override: (r) => analysisOf(9636)(r) ? err(500, 'INTERNAL_ERROR', 'Internal server error.', null) : null, views: [{ name: 'internal' }] },
  { id: 'race-offline', path: '/race/9636', override: (r) => analysisOf(9636)(r) ? { abort: 'internetdisconnected' } : null, views: [{ name: 'offline' }] },

  // ── race engineer chat ───────────────────────────────────────────────────
  { id: 'chat-offline', path: '/race/9636',
    override: (r) => r.path === '/chat/health' ? { json: { ollama_reachable: false, base_url: 'x', model: 'llama3.1:8b', ai_ready: false, error: 'Ollama not reachable' } } : null,
    views: [{ name: 'offline', act: openChat }] },
  { id: 'chat-answer', path: '/race/9636', views: [
    { name: 'open', act: openChat },
    { name: 'answered', act: (p) => askFirstSuggestion(p) },
  ] },
  // Staged: the real model cited nothing for the recorded question, so citations come from a
  // fixture that cites two real 9636 notes (ids are S1…Sn in engineer_notes order).
  { id: 'chat-cited', path: '/race/9636',
    override: (r) => r.path === '/chat' && r.method === 'POST' ? { json: {
      answer: 'Lap 27 was the pivot. HAM pitted under the SC/VSC on lap 27 and gained through the cycle, while BEA lost time to a slow stop: a 35.7 s lane against a 25.6 s race baseline.',
      cited_signals: [{ id: 'S4', lap_number: 27, title: 'HAM pitted under SC/VSC — L27' }, { id: 'S2', lap_number: 27, title: 'BEA slow stop L27' }],
      confidence: 'High', declared_confidence: 'High', provider: 'ollama', model: 'llama3.1:8b',
    } } : null,
    views: [{ name: 'open', act: openChat }, { name: 'cited', act: (p) => askFirstSuggestion(p) }] },
  { id: 'chat-rate-limited', path: '/race/9636',
    override: (r) => r.path === '/chat' ? err(429, 'RATE_LIMITED', 'Message limit reached (20 per 10 min for this browser session). Try again in 540 s.', { retry_after_seconds: 540, scope: 'session', limit: 20, window_seconds: 600 }) : null,
    views: [{ name: 'open', act: openChat }, { name: 'limited', act: (p) => askFirstSuggestion(p) }] },

  // ── driver card ──────────────────────────────────────────────────────────
  { id: 'driver-card-9636', path: '/race/9636', views: [
    { name: 'card', act: async (p) => { await p.getByRole('tab', { name: /data view/i }).click(); await p.waitForTimeout(300); await p.getByText('VER', { exact: true }).first().click(); await p.waitForTimeout(400) } },
  ] },
]

async function openChat(p) {
  await p.getByRole('button', { name: /race engineer|engineer|radio/i }).first().click()
  await p.waitForTimeout(2500) // the opening phase plays before the chat
}

async function askFirstSuggestion(p) {
  const box = p.getByRole('textbox').last()
  await box.fill('Who had the best race pace?')
  const answered = p.waitForResponse((r) => new URL(r.url()).pathname === '/chat' && r.request().method() === 'POST', { timeout: 300_000 })
  await box.press('Enter')
  await answered.catch(() => {})
  await p.waitForTimeout(1500)
}
