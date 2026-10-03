'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import s from '@/components/live/dashboard/live.module.css'
import { PreviewShell } from '@/components/preview/PreviewShell'
import { RaceLapCharts } from '@/components/charts/LapCharts'
import { fetchAnalysis, fetchLapCharts, type LapChartsPayload } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { formatLap, type ChartDriver } from '@/lib/lapCharts'
import type { FullRaceAnalysis } from '@/types'

type Tab = 'overview' | 'pace' | 'tyres' | 'charts' | 'weather' | 'notes'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'pace', label: 'True pace' },
  { id: 'tyres', label: 'Tyres & pits' },
  { id: 'charts', label: 'Lap charts' },
  { id: 'weather', label: 'Weather & radio' },
  { id: 'notes', label: 'Engineer notes' },
]
const COMPOUND: Record<string, string> = { SOFT: '#ec3013', MEDIUM: 'oklch(0.85 0.16 90)', HARD: '#f0f2f5', INTERMEDIATE: 'oklch(0.62 0.15 150)', WET: '#4da3ff' }
const colourOf = (c: string | null | undefined) => (c ? `#${c.replace('#', '')}` : '#8a94a6')

export default function PreviewRace() {
  const key = Number(useParams().sessionKey)
  const [a, setA] = useState<FullRaceAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')

  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab
    if (TABS.some(t => t.id === h)) setTab(h)
  }, [])
  useEffect(() => {
    let cancelled = false
    fetchAnalysis(key).then(r => { if (!cancelled) setA(r) }).catch(e => {
      if (cancelled) return
      setError(e instanceof ApiError && e.code === 'PRO_REQUIRED'
        ? 'This race is part of PRO. Enter an access code in Settings to open it.'
        : (e as Error)?.message ?? 'Could not load the analysis.')
    })
    return () => { cancelled = true }
  }, [key])
  const pick = (t: Tab) => {
    setTab(t)
    try { window.history.replaceState(null, '', `#${t}`) } catch { /* ignore */ }
  }

  return (
    <PreviewShell active="historical">
      {!a ? (
        <div className={s.empty} style={{ padding: 48, fontSize: 15, color: error ? 'var(--pw-accent-text)' : undefined }}>
          {error ?? 'Loading the race analysis…'}{error && <> · <Link href="/preview" style={{ color: 'var(--pw-text)' }}>Back to the season</Link></>}
        </div>
      ) : <>
        <RaceHeader a={a} />
        <Kpis a={a} />
        <nav className={s.tabs} aria-label="Race views">
          {TABS.map(t => (
            <button key={t.id} className={`${s.tab} ${tab === t.id ? s.tabOn : ''}`} onClick={() => pick(t.id)} aria-current={tab === t.id ? 'page' : undefined}>{t.label}</button>
          ))}
        </nav>
        {tab === 'overview' && <Overview a={a} />}
        {tab === 'pace' && <Pace a={a} />}
        {tab === 'tyres' && <TyresPits a={a} />}
        {tab === 'charts' && <Charts sessionKey={key} />}
        {tab === 'weather' && <WeatherRadio a={a} />}
        {tab === 'notes' && <Notes a={a} />}
      </>}
    </PreviewShell>
  )
}

function RaceHeader({ a }: { a: FullRaceAnalysis }) {
  const r = a.race
  const laps = Math.max(0, ...a.race_phases.map(p => p.lap_end))
  return (
    <header className={s.header}>
      <div style={{ minWidth: 0 }}>
        <div className={s.kicker}><span className={s.square} />Race analysis · OpenF1 · Session {r.session_key}</div>
        <h1 className={s.h1}>{r.circuit_short_name ?? r.meeting_name}</h1>
        <div className={s.meta}><b>{r.meeting_name} {r.year}</b><span>{r.session_name}</span>{r.country_name && <span>{r.country_name}</span>}{laps > 0 && <span>{laps} laps</span>}</div>
      </div>
      <div className={s.headRight}>
        <div className={s.cells} style={{ gridTemplateColumns: 'repeat(2,minmax(140px,1fr))', border: '2px solid var(--pw-divider)' }}>
          <div className={`${s.cell} ${s.cellTight}`}><div className={s.label}>Race phase</div><div className={s.mid} style={{ fontSize: 22 }}>{a.race_brain.race_phase}</div></div>
          <div className={`${s.cell} ${s.cellTight}`}><div className={s.label}>Strategic tension</div><div className={s.mid} style={{ fontSize: 22 }}>{a.race_brain.strategic_tension}</div></div>
        </div>
      </div>
    </header>
  )
}

function Kpis({ a }: { a: FullRaceAnalysis }) {
  const cls = [...a.race_classification].filter(r => r.finishing_position != null).sort((x, y) => (x.finishing_position as number) - (y.finishing_position as number))
  const winner = cls[0]
  const pace = a.true_pace[0]
  const stops = a.pit_impact.length
  const gainer = [...a.race_classification].sort((x, y) => (y.positions_gained ?? -99) - (x.positions_gained ?? -99))[0]
  const cell = (label: string, value: ReactNode, sub: string, accent = false) => (
    <div className={s.cell}><div className={s.label}>{label}</div><div className={`${s.big} ${accent ? s.accent : ''}`}>{value}</div><div className={s.sub}>{sub}</div></div>
  )
  return (
    <section className={`${s.cells} ${s.ruled}`} style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
      {cell('Winner', winner?.driver_code ?? '—', winner ? `${winner.team_name ?? ''}${winner.grid_position ? ` · from P${winner.grid_position}` : ''}` : 'Not classified', true)}
      {cell('True pace', pace?.driver_code ?? '—', pace ? `${formatLap(pace.median_clean_lap)} median clean lap` : '—')}
      {cell('Chaos index', a.chaos.score.toFixed(1), `${a.chaos.level}${a.chaos.peak_chaos_lap ? ` · peak lap ${a.chaos.peak_chaos_lap}` : ''}`)}
      {cell('Pit stops', String(stops), `${a.pit_cycles.length} pit cycles`)}
      {cell('Biggest gain', gainer?.positions_gained ? `+${gainer.positions_gained}` : '—', gainer ? `${gainer.driver_code} · P${gainer.grid_position} → P${gainer.finishing_position}` : '—')}
      {cell('Best compound', a.race_brain.best_compound ?? '—', a.race_dna ? `${a.race_dna.strategy_type}` : 'by measured pace')}
    </section>
  )
}

function Panel({ title, sub, aside, children, span2 = false }: { title: string; sub?: string; aside?: string; children: ReactNode; span2?: boolean }) {
  return (
    <div className={`${s.panel} ${span2 ? s.span2 : ''}`}>
      <div className={s.secHead}><h6 className={s.h6}>{title}</h6>{sub && <span className={s.sub}>{sub}</span>}{aside && <span className={s.secAside}>{aside}</span>}</div>
      {children}
    </div>
  )
}

function Overview({ a }: { a: FullRaceAnalysis }) {
  const cls = [...a.race_classification].sort((x, y) => (x.finishing_position ?? 99) - (y.finishing_position ?? 99))
  const laps = Math.max(1, ...a.race_phases.map(p => p.lap_end))
  const PH: Record<string, string> = { green: 'oklch(0.62 0.15 150)', amber: 'oklch(0.85 0.16 90)', red: '#ec3013', blue: '#4da3ff', purple: 'oklch(0.62 0.2 305)', muted: 'rgba(240,242,245,0.25)' }
  return <>
    <section className={`${s.cells} ${s.section} ${s.three}`} style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
      <Panel title="Race brain" sub="The race in one read" span2>
        <div style={{ padding: '20px 20px 8px', fontSize: 22, fontWeight: 800, lineHeight: 1.3, letterSpacing: '-0.01em' }}>{a.race_brain.main_question}</div>
        <div style={{ padding: '0 20px 20px', fontSize: 14, lineHeight: 1.6, color: 'var(--pw-muted)' }}>{a.race_brain.summary}</div>
        {a.race_phases.length > 0 && (
          <div style={{ padding: '0 20px 20px' }}>
            <div className={s.label} style={{ marginBottom: 8 }}>Race phases</div>
            <div style={{ display: 'flex', height: 28, gap: 2 }}>
              {a.race_phases.map((ph, i) => (
                <div key={i} title={`L${ph.lap_start}–${ph.lap_end} · ${ph.phase} · ${ph.reason}`}
                  style={{ flex: ph.lap_end - ph.lap_start + 1, background: PH[ph.color_token] ?? PH.muted, display: 'flex', alignItems: 'center', paddingLeft: 6, fontSize: 10, fontWeight: 800, color: '#05060a', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {ph.phase}
                </div>
              ))}
            </div>
            <div className={s.sub} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}><span>Lap 1</span><span>Lap {laps}</span></div>
          </div>
        )}
      </Panel>
      <Panel title="Classification" sub="Grid → finish" aside={`${cls.length} classified`}>
        <div className={`${s.list} ${s.scroll}`}>
          {cls.map(r => (
            <div key={r.driver_number} style={{ display: 'grid', gridTemplateColumns: '34px 4px 1fr auto', gap: 10, alignItems: 'center', padding: '7px 20px', fontSize: 14 }}>
              <span style={{ fontWeight: 800, color: r.finishing_position === 1 ? 'var(--pw-accent-text)' : undefined }}>{r.finishing_position != null ? `P${r.finishing_position}` : 'DNF'}</span>
              <span style={{ height: 18, background: colourOf(r.team_colour) }} />
              <b>{r.driver_code}</b>
              <span className={s.sub}>{r.grid_position ? `from P${r.grid_position}` : ''}{r.positions_gained ? ` · ${r.positions_gained > 0 ? '▲' : '▼'}${Math.abs(r.positions_gained)}` : ''}</span>
            </div>
          ))}
        </div>
      </Panel>
    </section>
    {a.race_dna && (
      <section className={`${s.cells} ${s.section}`} style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        {([['Primary factor', a.race_dna.primary_factor], ['Secondary factor', a.race_dna.secondary_factor], ['Overtaking', a.race_dna.overtaking_difficulty],
          ['Pit timing', a.race_dna.pit_timing_sensitivity], ['Tyre impact', a.race_dna.tyre_degradation_impact], ['Chaos', a.race_dna.chaos_level]] as const).map(([l, v]) => (
          <div key={l} className={s.cell} style={{ padding: '14px 20px' }}><div className={s.label}>{l}</div><div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{v}</div></div>
        ))}
      </section>
    )}
  </>
}

function Pace({ a }: { a: FullRaceAnalysis }) {
  const best = a.true_pace[0]?.median_clean_lap ?? 0
  const worst = Math.max(...a.true_pace.map(r => r.median_clean_lap))
  return (
    <section className={s.section}>
      <div className={`${s.secHead} ${s.secHeadWide}`}><h6 className={s.h6}>True pace</h6><span className={s.sub}>Median clean lap — pit, safety-car and traffic laps removed. Not the result.</span></div>
      <div className={s.list}>
        {a.true_pace.map(r => (
          <div key={r.driver_number} style={{ display: 'grid', gridTemplateColumns: '40px 4px 64px 1fr 110px 90px 120px', gap: 14, alignItems: 'center', padding: '10px 32px' }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: r.rank === 1 ? 'var(--pw-accent-text)' : undefined }}>{String(r.rank).padStart(2, '0')}</span>
            <span style={{ height: 24, background: colourOf(r.team_colour) }} />
            <b style={{ fontSize: 16 }}>{r.driver_code}</b>
            <div style={{ height: 10, background: 'var(--pw-surface)' }}><div style={{ height: '100%', width: `${100 - ((r.median_clean_lap - best) / (worst - best || 1)) * 85}%`, background: r.rank === 1 ? 'var(--pw-accent)' : 'rgba(240,242,245,0.45)' }} /></div>
            <span style={{ fontWeight: 800 }}>{formatLap(r.median_clean_lap)}</span>
            <span className={s.sub}>{r.rank === 1 ? 'reference' : `+${(r.median_clean_lap - best).toFixed(3)}`}</span>
            <span className={s.sub}>n={r.sample_size} · {r.confidence} · finished {r.finishing_position ? `P${r.finishing_position}` : '—'}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function TyresPits({ a }: { a: FullRaceAnalysis }) {
  const laps = Math.max(1, ...a.tyre_degradation.map(t => t.lap_end))
  const byDriver = useMemo(() => {
    const m = new Map<string, typeof a.tyre_degradation>()
    for (const t of a.tyre_degradation) m.set(t.driver_code, [...(m.get(t.driver_code) ?? []), t])
    const order = [...a.race_classification].sort((x, y) => (x.finishing_position ?? 99) - (y.finishing_position ?? 99)).map(r => r.driver_code)
    return order.filter(c => m.has(c)).map(c => [c, m.get(c)!.sort((x, y) => x.stint_number - y.stint_number)] as const)
  }, [a])
  return (
    <section className={`${s.cells} ${s.section} ${s.three}`} style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
      <Panel title="Tyre strategy" sub="Stints by lap · finishing order" span2>
        <div style={{ padding: '16px 20px' }}>
          {byDriver.map(([code, stints]) => (
            <div key={code} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 10, alignItems: 'center', marginBottom: 6 }}>
              <b style={{ fontSize: 13 }}>{code}</b>
              <div style={{ position: 'relative', height: 22, background: 'var(--pw-surface)' }}>
                {stints.map(st => {
                  const c = st.compound.toUpperCase()
                  return (
                    <div key={st.stint_number} title={`${c} · L${st.lap_start}–${st.lap_end} · ${(st.degradation_slope * 1000).toFixed(0)} ms/lap · cliff ${st.cliff_risk}`}
                      style={{ position: 'absolute', top: 0, bottom: 0, left: `${(st.lap_start - 1) / laps * 100}%`, width: `${(st.lap_end - st.lap_start + 1) / laps * 100}%`,
                        background: COMPOUND[c] ?? 'rgba(240,242,245,0.3)', border: '2px solid var(--pw-bg)', boxSizing: 'border-box', fontSize: 10, fontWeight: 800,
                        color: c === 'HARD' || c === 'MEDIUM' ? '#05060a' : '#fff', paddingLeft: 5, display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {c[0]} {st.lap_end - st.lap_start + 1} · {(st.degradation_slope * 1000).toFixed(0)}ms
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          <div className={s.sub} style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0 0 62px', fontSize: 11 }}><span>Lap 1</span><span>Lap {laps}</span></div>
        </div>
      </Panel>
      <Panel title="Pit stops" sub="Lane time and what it did" aside={`${a.pit_impact.length} stops`}>
        <div className={`${s.list} ${s.scroll}`}>
          {[...a.pit_impact].sort((x, y) => x.lap_number - y.lap_number).map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px 48px 70px 1fr', gap: 8, padding: '9px 20px', alignItems: 'center', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>L{p.lap_number}</span><b>{p.driver_code}</b>
              <span>{p.lane_duration != null ? `${p.lane_duration.toFixed(1)} s` : '—'}</span>
              <span className={s.sub} style={{ fontSize: 12 }}>{p.net_position_change != null ? `${p.net_position_change > 0 ? '▲' : p.net_position_change < 0 ? '▼' : '='}${Math.abs(p.net_position_change) || ''} · ` : ''}{p.verdict}</span>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  )
}

function Charts({ sessionKey }: { sessionKey: number }) {
  const [data, setData] = useState<LapChartsPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { fetchLapCharts(sessionKey).then(setData).catch(e => setErr((e as Error)?.message ?? 'Lap data unavailable.')) }, [sessionKey])
  const drivers: ChartDriver[] = useMemo(() => (data?.drivers ?? []).map(d => ({
    number: d.number, code: d.code, colour: d.colour, position: d.position, stints: d.stints,
    laps: d.laps.map(([lap, time, pitOut, pitIn]) => ({ lap, time, pitOut, pitIn })),
  })), [data])
  if (err) return <div className={s.empty}>{err}</div>
  if (!data) return <div className={s.empty}>Loading lap data…</div>
  return <RaceLapCharts drivers={drivers} bands={data.bands} totalLaps={data.total_laps} winnerCode={data.winner} idPrefix="preview" />
}

function WeatherRadio({ a }: { a: FullRaceAnalysis }) {
  const w = a.weather_analysis
  const clips = a.team_radio?.clips.filter(c => c.phase === 'race').slice(0, 12) ?? []
  return (
    <section className={`${s.cells} ${s.section}`} style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(380px,1fr))' }}>
      <Panel title="Weather" sub="Over the race">
        {w ? <>
          <div className={s.cells} style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
            {([['Track avg', `${w.avg_track_temp.toFixed(1)} °C`], ['Track range', `${w.min_track_temp.toFixed(1)}–${w.max_track_temp.toFixed(1)} °C`], ['Dry laps', String(w.dry_laps)], ['Wet laps', String(w.wet_laps)]] as const).map(([l, v]) => (
              <div key={l} className={s.cell} style={{ padding: '12px 20px' }}><div className={s.label}>{l}</div><div style={{ fontSize: 24, fontWeight: 800 }}>{v}</div></div>
            ))}
          </div>
          <div className={s.foot} style={{ fontSize: 13 }}>{w.summary}</div>
        </> : <div className={s.empty}>No weather analysis for this race.</div>}
      </Panel>
      <Panel title="Team radio" sub="During the race" aside={a.team_radio ? `${a.team_radio.in_race} clips` : undefined}>
        <div className={s.list}>
          {clips.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '50px 1fr auto', gap: 12, padding: '10px 20px', alignItems: 'center' }}>
              <b>{c.driver_code}</b><span className={s.sub}>{c.lap_number ? `Lap ${c.lap_number}` : ''}</span>
              <audio controls preload="none" src={c.recording_url} style={{ height: 30, maxWidth: 220 }} />
            </div>
          ))}
          {!clips.length && <div className={s.empty}>No race radio published.</div>}
        </div>
      </Panel>
    </section>
  )
}

function Notes({ a }: { a: FullRaceAnalysis }) {
  const notes = [...a.engineer_notes].sort((x, y) => (x.lap_number ?? 0) - (y.lap_number ?? 0))
  return (
    <section className={s.section}>
      <div className={`${s.secHead} ${s.secHeadWide}`}><h6 className={s.h6}>Engineer notes</h6><span className={s.sub}>What the data says, lap by lap</span><span className={s.secAside}>{notes.length}</span></div>
      <div className={s.list}>
        {notes.map((n, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 6px 1fr 140px', gap: 14, padding: '12px 32px', alignItems: 'start' }}>
            <span style={{ fontWeight: 800 }}>{n.lap_number ? `L${n.lap_number}` : '—'}</span>
            <span style={{ alignSelf: 'stretch', background: n.severity === 'High' ? 'var(--pw-accent)' : n.severity === 'Medium' ? 'oklch(0.85 0.16 90)' : 'rgba(240,242,245,0.25)' }} />
            <div><div style={{ fontSize: 15, fontWeight: 800 }}>{n.title}</div><div className={s.sub} style={{ fontSize: 13, lineHeight: 1.5, marginTop: 2 }}>{n.message}</div></div>
            <span className={s.label} style={{ textAlign: 'right' }}>{n.type.replace('_', ' ')}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
