'use client'

import Link from 'next/link'
import s from '@/components/live/dashboard/live.module.css'
import { PreviewShell } from '@/components/preview/PreviewShell'
import { FREE_SEASONS, PRO_PRICE_LABEL } from '@/lib/access'

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  { id: 'what-it-is', title: 'What it is', body: <>
    <p>Pit Wall Engineer turns raw Formula 1 timing data into the analysis a race engineer would run: true pace with pit stops and safety cars stripped out, tyre degradation, pit-stop impact, race phases, weather crossovers, and a Chaos Index that scores how disordered a race was.</p>
    <p>Pick a season and a Grand Prix and the site builds the full breakdown — then ask the AI engineer about that race, answered from its own computed analysis rather than a model guessing from memory.</p>
  </> },
  { id: 'free', title: 'Free', body: <p>Every race from <b>{FREE_SEASONS.join(' and ')}</b> — full analysis, every session type, no account and no code.</p> },
  { id: 'pro', title: 'PRO', body: <>
    <p>{PRO_PRICE_LABEL}.</p>
    <p>Races from 2025 onwards, the current season as it is published (usually within hours of the flag), and Live mode. Access today is by a code, entered once in <Link href="/preview/settings" style={{ color: 'var(--pw-accent-text)' }}>Settings</Link>.</p>
  </> },
  { id: 'live', title: 'Live mode', body: <>
    <p>During a session the pit wall updates every couple of seconds: timing and sectors, the track map and any car&apos;s telemetry, race control, weather, tyres, pit stops, team radio and lap charts.</p>
    <p>Everything is a reading of the feed except the <b>Predictions</b> tab — win and pole odds from a model run on the laps so far, labelled as a projection wherever it appears and checked against past races. The <b>Engineer AI</b> answers questions from the same live data, and its team-radio mode is a clearly marked role-play.</p>
    <p>Not live yet? Ask to be notified when the session starts.</p>
  </> },
  { id: 'data', title: 'Data sources', body: <p>Timing, laps, stints, pit stops, positions, race control, weather and live car data come from <a href="https://openf1.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pw-accent-text)' }}>OpenF1</a>; historical circuit telemetry from <a href="https://docs.fastf1.dev" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pw-accent-text)' }}>FastF1</a>. Team radio is linked from Formula 1&apos;s archive, never copied.</p> },
  { id: 'legal', title: 'Legal', body: <p>Unofficial project, not associated in any way with the Formula 1 companies. F1, FORMULA 1 and related marks are trademarks of Formula One Licensing B.V.</p> },
]

export default function PreviewDocs() {
  return (
    <PreviewShell active="docs">
      <header className={s.header}>
        <div style={{ minWidth: 0 }}>
          <div className={s.kicker}><span className={s.square} />Documentation</div>
          <h1 className={s.h1}>Docs</h1>
          <div className={s.meta}><b>What it is, what is free, what PRO adds.</b></div>
        </div>
      </header>
      <nav className={s.tabs} aria-label="Sections">
        {SECTIONS.map(x => <a key={x.id} href={`#${x.id}`} className={s.tab} style={{ textDecoration: 'none' }}>{x.title}</a>)}
      </nav>
      <div className={s.cells} style={{ gridTemplateColumns: 'minmax(200px,1fr) minmax(0,3fr)' }}>
        {SECTIONS.map(x => [
          <div key={`${x.id}-h`} id={x.id} className={s.cell} style={{ scrollMarginTop: 140 }}><div className={s.label}>{String(SECTIONS.indexOf(x) + 1).padStart(2, '0')}</div><h2 style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 800 }}>{x.title}</h2></div>,
          <div key={`${x.id}-b`} className={s.cell} style={{ fontSize: 15, lineHeight: 1.65, display: 'grid', gap: 10, maxWidth: 820 }}>{x.body}</div>,
        ])}
      </div>
    </PreviewShell>
  )
}
