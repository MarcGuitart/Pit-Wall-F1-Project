'use client'

import { useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import s from '@/components/live/dashboard/live.module.css'
import { PreviewShell } from '@/components/preview/PreviewShell'
import { sendToEngineer, type EngineerAnswer } from '@/lib/api'
import { useRaceAnalysis } from '@/hooks/useRaceAnalysis'
import { useRaceStore } from '@/stores/raceStore'
import { AnalysisPage } from '@/components/analysis/AnalysisPage'
import { AnalysisLoadingScreen } from '@/components/analysis/AnalysisLoadingScreen'
import { SessionUnavailableState } from '@/components/analysis/SessionUnavailableState'
import { ProWall } from '@/components/access/ProWall'
import { formatLap } from '@/lib/lapCharts'
import type { FullRaceAnalysis } from '@/types'


export default function PreviewRace() {
  const key = Number(useParams().sessionKey)
  const { loading, data: a, error, retry } = useRaceAnalysis(Number.isNaN(key) ? null : key)
  const { loadingStep } = useRaceStore()

  return (
    <PreviewShell active="historical">
      {error ? (
        <div style={{ padding: '48px 32px', display: 'flex', justifyContent: 'center' }}>
          {error.code === 'PRO_REQUIRED'
            ? <ProWall year={error.year ?? null} onUnlocked={() => retry()} />
            : <SessionUnavailableState code={error.code} message={error.message} unlockAtUtc={error.unlockAtUtc}
                retryAfterMinutes={error.retryAfterMinutes} onRetry={() => retry()} sessionKey={key} />}
        </div>
      ) : loading || !a ? (
        <AnalysisLoadingScreen raceName="Loading the race…" currentStep={loadingStep} />
      ) : <>
        <RaceHeader a={a} />
        <Kpis a={a} />
        {/* Every module the race page computes — the classic components, re-skinned by .pw-modern. */}
        <AnalysisPage analysis={a} hideHeader />
        <AskEngineer a={a} />
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

const QUICK = ['Who had the best race pace?', 'Which pit stop changed the race?', 'Where was the race won?', 'Who lost the most to tyre wear?']

function AskEngineer({ a }: { a: FullRaceAnalysis }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [driver, setDriver] = useState('')
  const [log, setLog] = useState<({ who: 'you'; text: string } | { who: 'ai'; reply: EngineerAnswer } | { who: 'err'; text: string })[]>([])
  async function ask(text: string) {
    const question = text.trim()
    if (!question || busy) return
    setQ('')
    setBusy(true)
    setLog(l => [...l, { who: 'you', text: question }])
    try {
      const reply = await sendToEngineer({ session_key: a.race.session_key, question, focused_driver: driver || null })
      setLog(l => [...l, { who: 'ai', reply }])
    } catch (e) {
      setLog(l => [...l, { who: 'err', text: (e as Error)?.message ?? 'The engineer is not reachable.' }])
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className={s.section}>
      <div className={`${s.secHead} ${s.secHeadWide}`} style={{ alignItems: 'center' }}>
        <h6 className={s.h6}>Engineer AI</h6><span className={s.sub}>Answers from this race&apos;s computed analysis, with the signals it used</span>
        <select className={s.btn} value={driver} onChange={e => setDriver(e.target.value)} style={{ marginLeft: 'auto', background: 'var(--pw-surface)' }} aria-label="Driver">
          <option value="">Whole field</option>
          {a.race_classification.map(r => <option key={r.driver_number} value={r.driver_code}>{r.driver_code}</option>)}
        </select>
      </div>
      <div style={{ padding: '16px 32px', display: 'grid', gap: 12, minHeight: 260 }}>
        {!log.length && <div className={s.sub} style={{ fontSize: 14 }}>Ask about pace, strategy, pit stops or where the race turned.</div>}
        {log.map((m, i) => m.who === 'you'
          ? <div key={i} style={{ justifySelf: 'end', maxWidth: '75%', border: '2px solid var(--pw-divider)', background: 'var(--pw-surface)', padding: '8px 12px' }}>{m.text}</div>
          : m.who === 'err' ? <div key={i} style={{ color: 'var(--pw-accent-text)' }}>{m.text}</div>
          : <div key={i} style={{ maxWidth: '85%', borderLeft: '4px solid var(--pw-text)', padding: '4px 14px', lineHeight: 1.6 }}>
              <div className={s.label} style={{ marginBottom: 4 }}>Engineer{m.reply.confidence ? ` · ${m.reply.confidence} confidence` : ''}</div>
              {m.reply.answer}
              {!!m.reply.cited_signals?.length && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{m.reply.cited_signals.map(c => <span key={c.id} style={{ fontSize: 11, border: '1px solid var(--pw-divider)', padding: '1px 6px' }}>{c.lap_number ? `L${c.lap_number} · ` : ''}{c.title}</span>)}</div>}
            </div>)}
        {busy && <div className={s.sub}>Reading the analysis…</div>}
      </div>
      <div style={{ padding: '10px 32px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--pw-divider)' }}>
        {QUICK.map(x => <button key={x} className={s.btn} style={{ fontSize: 11 }} disabled={busy} onClick={() => ask(x)}>{x}</button>)}
      </div>
      <form onSubmit={e => { e.preventDefault(); void ask(q) }} style={{ display: 'flex', borderTop: '2px solid var(--pw-divider)' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask the engineer…" aria-label="Question" maxLength={500}
          style={{ flex: 1, font: 'inherit', fontSize: 14, padding: '14px 32px', background: 'transparent', color: 'var(--pw-text)', border: 0, outline: 'none' }} />
        <button type="submit" disabled={busy || !q.trim()} className={s.segOn} style={{ font: 'inherit', fontWeight: 800, padding: '0 26px', border: 0, cursor: 'pointer', opacity: busy || !q.trim() ? 0.5 : 1 }}>ASK</button>
      </form>
    </section>
  )
}
