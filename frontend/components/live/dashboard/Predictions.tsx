'use client'

import s from './live.module.css'
import { formatLap } from '@/lib/lapCharts'
import type { LiveSnapshot } from '@/types/live'

/**
 * The one tab on the live page that is a model and not a reading. It says so
 * in its title, its badge and its footer: a projection from the laps measured
 * so far, re-run every frame, never a result.
 */

const pct = (v: number | undefined) => (v == null ? '—' : v >= 0.995 ? '>99%' : v > 0 && v < 0.005 ? '<1%' : `${Math.round(v * 100)}%`)
const colourOf = (c: string | null | undefined) => (c ? `#${c.replace('#', '')}` : '#8a94a6')

export function Predictions({ snapshot }: { snapshot: LiveSnapshot }) {
  const p = snapshot.projection
  const race = (snapshot.profile ?? 'race') === 'race'
  const title = race ? 'Who wins from here' : 'Who takes pole'
  if (!p) {
    return (
      <section className={s.section}>
        <div className={`${s.secHead} ${s.secHeadWide}`}><h6 className={s.h6}>{title}</h6><span className={s.sub}>Projection</span></div>
        <div className={s.empty}>The live server has not been updated with the projection model yet — it appears here as soon as it is redeployed.</div>
      </section>
    )
  }
  const max = Math.max(0.01, ...p.drivers.map(d => d.win))
  return (
    <section className={s.section}>
      <div className={`${s.secHead} ${s.secHeadWide}`} style={{ alignItems: 'center' }}>
        <h6 className={s.h6}>{title}</h6>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', padding: '2px 7px', border: '2px solid var(--pw-accent)', color: 'var(--pw-accent-text)' }}>PROJECTION · NOT A RESULT</span>
        {p.confidence && <span className={s.sub}>{p.confidence} confidence</span>}
        <span className={s.secAside}>{p.simulations} simulations · re-run every frame</span>
      </div>

      {race && p.total_laps != null && (
        <div className={s.cells} style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', borderBottom: '2px solid var(--pw-divider)' }}>
          <Stat label="Distance" value={`${p.total_laps} laps`} sub={p.total_laps_source ?? ''} />
          <Stat label="Laps left" value={p.laps_left != null ? String(p.laps_left) : '—'} sub={`as of lap ${p.lap ?? '—'}`} />
          <Stat label="Pit loss" value={p.pit_loss_s != null ? `${p.pit_loss_s.toFixed(1)} s` : '—'} sub={p.pit_loss_source ?? ''} />
          <Stat label="Safety car chance" value={pct(p.sc_probability)} sub="at least one, over the laps left" />
        </div>
      )}

      {p.error ? <div className={s.empty}>The model failed on this frame ({p.error}); the next frame retries.</div>
        : !p.drivers.length ? <div className={s.empty}>No projection yet — {p.reason ?? 'waiting for data'}.</div> : (
        <div className={s.timingScroll}>
          <div style={{ minWidth: 860 }}>
            <div className={s.tHead} style={{ gridTemplateColumns: race ? GRID_RACE : GRID_POLE }}>
              {(race ? ['Driver', 'Now', 'Win', '', 'Podium', 'Projected', 'Pace', 'Wear', 'Stops owed', 'Tyre'] : ['Driver', 'Now', 'Pole', '', 'Best', 'Ideal', 'Room']).map((h, i) => <div key={i} className={s.th}>{h}</div>)}
            </div>
            {p.drivers.map(d => (
              <div key={d.driver_number} className={s.tRow} style={{ gridTemplateColumns: race ? GRID_RACE : GRID_POLE, cursor: 'default' }}>
                <div className={s.td}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className={s.teamBar} style={{ height: 24, background: colourOf(d.colour) }} /><b style={{ fontSize: 16 }}>{d.code}</b></div></div>
                <div className={s.td}><span style={{ fontWeight: 600 }}>P{d.position}</span></div>
                <div className={s.td}><b style={{ fontSize: 18, color: d.win === max && d.win > 0 ? 'var(--pw-accent-text)' : undefined }}>{pct(d.win)}</b></div>
                <div className={s.td}><div style={{ height: 10, background: 'var(--pw-surface)' }}><div style={{ height: '100%', width: `${(d.win / max) * 100}%`, background: d.win === max ? 'var(--pw-accent)' : 'rgba(240,242,245,0.45)' }} /></div></div>
                {race ? <>
                  <div className={s.td}>{pct(d.podium)}</div>
                  <div className={s.td}><span style={{ fontWeight: 800 }}>P{d.projected_position}</span>{d.range && <span className={s.sub} style={{ fontSize: 11 }}>P{d.range[0]}–P{d.range[1]}</span>}</div>
                  <div className={s.td}>{formatLap(d.pace_s)}</div>
                  <div className={s.td}>{d.wear_s_per_lap != null ? `${d.wear_s_per_lap >= 0 ? '+' : ''}${Math.round(d.wear_s_per_lap * 1000)} ms/lap` : '—'}</div>
                  <div className={s.td}>{d.stops_owed ?? '—'}</div>
                  <div className={s.td}>{d.compound ?? '—'}{d.tyre_age != null ? ` · ${d.tyre_age}L` : ''}</div>
                </> : <>
                  <div className={s.td}>{formatLap(d.best_s)}</div>
                  <div className={s.td}>{formatLap(d.ideal_s ?? undefined)}</div>
                  <div className={s.td}>{d.best_s != null && d.ideal_s != null ? `−${(d.best_s - d.ideal_s).toFixed(3)}` : '—'}</div>
                </>}
              </div>
            ))}
          </div>
        </div>
      )}

      <details style={{ borderTop: '2px solid var(--pw-divider)' }}>
        <summary style={{ cursor: 'pointer', padding: '12px 32px', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>How this is computed</summary>
        <div className={s.foot} style={{ padding: '0 32px 16px', fontSize: 12, maxWidth: 960 }}>
          {race
            ? 'A Monte Carlo over the laps left. Each driver starts from their current gap to the leader and runs every remaining lap at the median of their last clean laps, plus the wear their current stint has measured. Stops still owed (a dry race needs two compounds; no stint runs past a compound\'s typical maximum) cost the pit-lane time measured in this race. Each simulation draws lap-to-lap noise from the driver\'s own consistency and a pace drift for the rest of the race, and may bring out a safety car that closes the field up and halves the cost of a stop. Distance is the scheduled lap count when known, otherwise 305 km over the lap length measured from this session\'s own track outline. Nothing here knows about strategy calls, damage or weather to come.'
            : 'Each simulation gives every driver one more attempt: a lap somewhere between their ideal lap (best sectors summed) and a little slower, never worse than the best they have already set. Pole goes to the fastest; the odds are how often each driver ends up on top. It ignores track evolution, traffic and elimination — a measure of the room each driver has left on one lap.'}
        </div>
      </details>
    </section>
  )
}

const GRID_RACE = 'minmax(120px,1fr) 64px 70px minmax(120px,2fr) 80px 110px 100px 110px 92px 120px'
const GRID_POLE = 'minmax(120px,1fr) 64px 70px minmax(160px,2fr) 110px 110px 90px'

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className={s.cell} style={{ padding: '14px 20px' }}><div className={s.label}>{label}</div><div className={s.mid}>{value}</div><div className={s.sub}>{sub}</div></div>
}
