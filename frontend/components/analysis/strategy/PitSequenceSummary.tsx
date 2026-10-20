import type { PitImpactRow } from '@/types'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'
import { Panel, toneClass, ui } from '@/components/ui'
import a from '../analysis.module.css'

type Props = {
  pitImpactRows: PitImpactRow[]
  onDriverClick: (code: string) => void
  onViewAll: () => void
  sessionType: string
}

function NetDelta({ delta }: { delta: number | null }) {
  if (delta == null) return <span className={`${a.num} ${a.muted}`}>n/a</span>
  if (delta > 0)  return <span className={`${a.num} ${toneClass('ok')}`}>+{delta}</span>
  if (delta < 0)  return <span className={`${a.num} ${toneClass('accent')}`}>{delta}</span>
  return <span className={`${a.num} ${a.muted}`}>±0</span>
}

function Side({ title, tone, rows, empty, onDriverClick }: {
  title: string; tone: 'ok' | 'accent'; rows: PitImpactRow[]; empty: string
  onDriverClick: (code: string) => void
}) {
  return (
    <div style={{ padding: 0 }}>
      <div className={`${a.row} ${a.colHead}`}>
        <span className={`${a.sq} ${toneClass(tone)}`} style={{ background: 'currentColor' }} aria-hidden="true" />
        <span className={`${ui.label} ${toneClass(tone)}`} style={{ fontWeight: 800 }}>{title}</span>
      </div>
      <div className={a.list}>
        {rows.length === 0
          ? <p className={`${a.item} ${a.para}`}>{empty}</p>
          : rows.map((row, i) => (
            <button key={i} type="button" onClick={() => onDriverClick(row.driver_code)} className={`${a.itemBtn} ${a.between}`} style={{ display: 'flex', padding: '8px 14px' }}>
              <span>
                <span className={a.code}>{row.driver_code}</span>
                <span className={ui.sub} style={{ display: 'block' }}>L{row.lap_number}</span>
              </span>
              <NetDelta delta={row.net_position_change} />
            </button>
          ))}
      </div>
    </div>
  )
}

export function PitSequenceSummary({ pitImpactRows, onDriverClick, onViewAll, sessionType }: Props) {
  if (sessionType !== 'Race') return null

  const valid = pitImpactRows.filter((r) => r.stop_type !== 'red_flag')
  const noData = valid.length === 0
  const allMissingLane = valid.every((r) => r.lane_duration == null)

  const winners = valid.filter((r) => (r.net_position_change ?? 0) > 0)
    .sort((x, y) => (y.net_position_change ?? 0) - (x.net_position_change ?? 0)).slice(0, 3)
  const losers = valid.filter((r) => (r.net_position_change ?? 0) < 0)
    .sort((x, y) => (x.net_position_change ?? 0) - (y.net_position_change ?? 0)).slice(0, 3)

  return (
    <Panel
      title="Pit Sequence"
      aside={<>winners · losers<MethodologyBadge module="pit" /></>}
      padded={false}
      foot={!noData && !allMissingLane ? (
        <button type="button" onClick={onViewAll} className={a.linkBtn}>Full pit data ({valid.length} stops) →</button>
      ) : undefined}
    >
      {noData ? (
        <div className={a.unavailable}>
          <h4 className={ui.h6}>No pit stop data available</h4>
          <p className={a.para}>OpenF1 returned no pit records for this session.</p>
        </div>
      ) : allMissingLane ? (
        <div className={a.unavailable}>
          <h4 className={ui.h6}>Pit lane timing unavailable</h4>
          <p className={a.para}>Showing position change only: no lane duration data from OpenF1.</p>
        </div>
      ) : (
        <div className={a.kv} style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', borderLeft: 0 }}>
          <Side title="Gained" tone="ok" rows={winners} empty="No net gainers" onDriverClick={onDriverClick} />
          <Side title="Lost" tone="accent" rows={losers} empty="No net losers" onDriverClick={onDriverClick} />
        </div>
      )}
    </Panel>
  )
}
