/**
 * The live engineer's context: a plain-text digest of the snapshot the page is
 * already showing, plus the signals the model may cite. Built in the browser
 * because the API has no live state of its own (see backend /chat/live).
 *
 * Plain text and compact on purpose — a model reads "P3 NOR +1.204 MEDIUM 14L"
 * more reliably than nested JSON, and the API caps the context size.
 */
import { formatLap } from '@/lib/lapCharts'
import type { LiveSnapshot } from '@/types/live'

export type LiveSignal = { id: string; title: string; lap_number: number | null }

const fmtGap = (g: number | string | null | undefined) => (g == null ? '—' : typeof g === 'number' ? `+${g.toFixed(3)}` : g)

export function buildLiveDigest(snap: LiveSnapshot, focus: string | null): { context: string; signals: LiveSignal[] } {
  const d = snap.dashboard
  const lines: string[] = []
  const profile = snap.profile ?? 'race'
  lines.push(`SESSION ${snap.session_name ?? snap.session_type ?? '?'} at ${snap.location ?? '?'} · profile ${profile} · generated ${snap.generated_at}`)
  lines.push(`FLAG ${snap.track_status.flag} (${snap.track_status.source})${snap.chequered ? ' · CHEQUERED' : ''}`)
  if (profile === 'race') lines.push(`LAP ${snap.current_lap}${snap.race_distance ? ` of ${snap.race_distance}` : ' (race distance unknown until the flag)'}`)
  const w = d?.weather
  if (w) lines.push(`WEATHER air ${w.air_temperature ?? '—'}C track ${w.track_temperature ?? '—'}C humidity ${w.humidity ?? '—'}% wind ${w.wind_speed ?? '—'} m/s rain ${(w.rainfall ?? 0) > 0 ? 'yes' : 'no'}`)

  const detail = d?.laps_detail ?? {}
  if (profile === 'race') {
    lines.push('', 'ORDER pos code gap_to_leader interval last_lap best_lap tyre tyre_age stops')
    for (const r of snap.tower) {
      const det = detail[String(r.driver_number)]
      lines.push(`P${r.position} ${r.code} ${fmtGap(r.gap_to_leader)} ${fmtGap(r.interval)} ${formatLap(r.last_lap_s)} ${formatLap(det?.best_s)} ${r.compound ?? '?'} ${r.tyre_age ?? '?'}L stops ${r.stops}${r.pit_laps.length ? ` (L${r.pit_laps.join(',L')})` : ''}`)
    }
  } else {
    lines.push('', 'TIMING pos code best_lap gap_to_p1 S1 S2 S3 ideal laps clean_laps tyre tyre_age')
    for (const r of snap.practice_tower ?? []) {
      lines.push(`P${r.position} ${r.code} ${formatLap(r.best_lap_s)} ${r.gap_to_p1 ? `+${r.gap_to_p1.toFixed(3)}` : '—'} ${r.sectors.sector1.time ?? '—'} ${r.sectors.sector2.time ?? '—'} ${r.sectors.sector3.time ?? '—'} ${formatLap(r.ideal_lap?.total)} ${r.laps} ${r.clean_laps} ${r.compound ?? '?'} ${r.tyre_age ?? '?'}L`)
    }
    if (snap.pace?.length) {
      lines.push('', 'CLEAN PACE code median best n confidence')
      for (const p of snap.pace.slice(0, 20)) lines.push(`${p.code} ${formatLap(p.median_clean_lap_s)} ${formatLap(p.fastest_clean_lap_s)} ${p.sample_size} ${p.confidence}`)
    }
    if (snap.long_runs?.length) {
      lines.push('', 'LONG RUNS code laps compound median confidence')
      for (const g of snap.long_runs.slice(0, 12)) lines.push(`${g.code} L${g.lap_start}-${g.lap_end} ${g.compound ?? '?'} ${formatLap(g.median_s)} ${g.confidence}`)
    }
  }

  if (focus) {
    const num = snap.tower.find(r => r.code === focus)?.driver_number ?? snap.practice_tower?.find(r => r.code === focus)?.driver_number
    const laps = num != null ? d?.lap_times[String(num)] ?? [] : []
    if (laps.length) {
      lines.push('', `${focus} LAPS lap:time (P = pit-out lap)`)
      lines.push(laps.slice(-25).map(([l, t, out]) => `${l}:${formatLap(t)}${out ? 'P' : ''}`).join(' '))
    }
    const st = num != null ? d?.stints[String(num)] ?? [] : []
    if (st.length) lines.push(`${focus} STINTS ${st.map(s => `S${s.stint_number} ${s.compound ?? '?'} L${s.lap_start ?? '?'}-${s.lap_end ?? 'now'}`).join(' · ')}`)
    const car = d?.cars.find(c => c.code === focus)
    if (car) lines.push(`${focus} CAR NOW speed ${car.speed ?? '—'} gear ${car.gear ?? '—'} throttle ${car.throttle ?? '—'}% brake ${car.brake ?? '—'}`)
  }

  if (d?.records.length) {
    const r = d.records[d.records.length - 1]
    lines.push('', `SESSION BEST ${r.code} ${formatLap(r.time_s)} lap ${r.lap_number} (${d.records.length} improvements)`)
  }
  if (d?.pit_stops.length) {
    lines.push('', 'RECENT PIT STOPS ' + d.pit_stops.slice(0, 10).map(p => `${p.code} L${p.lap_number ?? '?'}${p.stop_duration ? ` ${p.stop_duration.toFixed(1)}s` : ''}`).join(' · '))
  }

  const pr = snap.projection
  if (pr?.drivers?.length) {
    lines.push('', `PROJECTION (model, not a result; ${pr.confidence ?? '?'} confidence, ${pr.simulations} simulations${pr.total_laps ? `, ${pr.total_laps} laps (${pr.total_laps_source})` : ''})`)
    for (const x of pr.drivers.slice(0, 10)) {
      lines.push(pr.kind === 'race'
        ? `${x.code} now P${x.position} win ${Math.round(x.win * 100)}% podium ${Math.round((x.podium ?? 0) * 100)}% projected P${x.projected_position} stops owed ${x.stops_owed}`
        : `${x.code} now P${x.position} pole ${Math.round(x.win * 100)}% best ${formatLap(x.best_s)} ideal ${formatLap(x.ideal_s ?? undefined)}`)
    }
  }

  // Signals: race control, engineer notes and pit-window readings, citable by id.
  const signals: LiveSignal[] = []
  ;(d?.race_control ?? []).slice(0, 25).forEach((m, i) => {
    if (m.message) signals.push({ id: `RC${i + 1}`, title: m.message.slice(0, 140), lap_number: m.lap_number })
  })
  snap.notes.slice(0, 15).forEach(n => signals.push({ id: `N-${n.id}`.slice(0, 40), title: `${n.title}: ${n.message}`.slice(0, 180), lap_number: n.lap_number }))
  snap.pit_watch.slice(0, 10).forEach((p, i) => signals.push({ id: `PW${i + 1}`, title: `${p.driver_code} ${p.headline} — ${p.measurement}`.slice(0, 180), lap_number: null }))

  return { context: lines.join('\n').slice(0, 13_500), signals }
}
