import type { WeatherWinnersLosers as WeatherWinnersLosersType, WeatherWinner, WeatherLoser } from '@/types'
import { Badge, ConfidenceBadge, toneClass, ui } from '@/components/ui'
import a from './analysis.module.css'

type Props = {
  data: WeatherWinnersLosersType
}

function ResultRow({ code, value, reason, confidence, tone }: {
  code: string; value: string; reason: string; confidence: WeatherWinner['confidence']; tone: 'ok' | 'accent'
}) {
  return (
    <div className={a.row} style={{ alignItems: 'flex-start', padding: '8px 0' }}>
      <Badge>{code}</Badge>
      <span className={a.grow}>
        <b className={toneClass(tone)}>{value}</b>{' '}
        <span className={ui.sub}>{reason}</span>
      </span>
      <ConfidenceBadge level={confidence} />
    </div>
  )
}

function Column({ title, tone, children, empty }: { title: string; tone: 'ok' | 'accent'; children: React.ReactNode[]; empty: boolean }) {
  return (
    <div className={a.subCard} style={{ gap: 0 }}>
      <div className={a.row} style={{ marginBottom: 4 }}>
        <span className={`${a.sq} ${toneClass(tone)}`} style={{ background: 'currentColor' }} aria-hidden="true" />
        <span className={`${ui.label} ${toneClass(tone)}`} style={{ fontWeight: 800 }}>{title}</span>
      </div>
      {empty ? <span className={ui.sub}>None identified</span> : <div className={a.list}>{children}</div>}
    </div>
  )
}

export function WeatherWinnersLosers({ data }: Props) {
  if (!data.winners.length && !data.losers.length) return null

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <h4 className={ui.h6}>Weather Winners &amp; Losers</h4>

      <div className={a.twoCol}>
        <Column title="Winners" tone="ok" empty={!data.winners.length}>
          {data.winners.map((w: WeatherWinner, i) => <ResultRow key={i} code={w.driver_code} value={w.gain} reason={w.reason} confidence={w.confidence} tone="ok" />)}
        </Column>
        <Column title="Losers" tone="accent" empty={!data.losers.length}>
          {data.losers.map((l: WeatherLoser, i) => <ResultRow key={i} code={l.driver_code} value={l.loss} reason={l.reason} confidence={l.confidence} tone="accent" />)}
        </Column>
      </div>

      {/* Attribution note — shown when concurrent SC may have influenced results */}
      {data.attribution_note && (
        <div className={a.warnNote} role="note">
          <span aria-hidden="true">ⓘ</span>
          <span>{data.attribution_note}</span>
        </div>
      )}
    </div>
  )
}
