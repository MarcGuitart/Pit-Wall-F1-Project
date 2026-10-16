import { AppShell } from '@/components/layout/AppShell'
import { RaceSelector } from '@/components/landing/RaceSelector'
import { SeasonGrid } from '@/components/landing/SeasonGrid'
import { ProSection } from '@/components/access/ProSection'
import { Cells, Metric, PageHeader, ui } from '@/components/ui'
import l from '@/components/landing/landing.module.css'

const STATS = [
  { value: '50K+', label: 'Data Points Per Session', sub: 'pos · intervals · car data · weather' },
  { value: '12', label: 'Analysis Modules', sub: 'pace · tyre · pit · chaos · DRS · DNA…' },
  { value: '40+', label: 'Strategic Signals', sub: 'engineer notes · decisions · phases' },
]

const STEPS = [
  { num: '01', title: 'Select a session', sub: 'Season, race and session type' },
  { num: '02', title: 'Decode the strategy', sub: 'Pace, tyres, pit cycles, chaos' },
  { num: '03', title: 'Ask the race engineer', sub: 'Grounded answers from session data' },
]

export default function HomePage() {
  return (
    <AppShell footerAttribution>
      <PageHeader
        kicker="Race Intelligence Dashboard"
        title={<>See the race<br /><span className={l.heroAccent}>like they do.</span></>}
        meta={
          <p className={l.lead} style={{ margin: 0 }}>
            Turn raw F1 data into strategy-grade insight: pace, tyres, pit windows
            and race momentum in one engineer-style view.
          </p>
        }
      />

      <Cells min={220} ruled>
        {STATS.map(({ value, label, sub }) => (
          <Metric key={label} label={label} value={value} sub={sub} />
        ))}
      </Cells>

      <Cells min={240} className={ui.section}>
        {STEPS.map((step) => (
          <div key={step.num} className={`${ui.cell} ${l.step}`}>
            <span className={l.stepNum} aria-hidden="true">{step.num}</span>
            <div>
              <div className={l.stepTitle}>{step.title}</div>
              <div className={ui.sub}>{step.sub}</div>
            </div>
          </div>
        ))}
      </Cells>

      <SeasonGrid />

      <section className={ui.section} aria-labelledby="any-session">
        <div className={`${ui.secHead} ${ui.secHeadWide}`}>
          <h2 className={ui.h6} id="any-session">Any session</h2>
          <span className={ui.sub}>Practice, qualifying, sprint and race — and the featured races</span>
        </div>
        <RaceSelector />
      </section>

      <ProSection />
    </AppShell>
  )
}
