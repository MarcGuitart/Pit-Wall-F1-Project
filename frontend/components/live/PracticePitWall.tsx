'use client'

import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { ConfidenceChip } from '@/components/ui/ConfidenceChip'
import { RadioFeed } from '@/components/live/RadioFeed'
import { formatLapTime } from '@/lib/format'
import type { LiveNote, LiveSnapshot, LongRunRow, PracticeTowerRow } from '@/types/live'

type Props = {
  snapshot: LiveSnapshot
  focusedDriver: string | null
  onFocus: (code: string | null) => void
}

const FLAG: Record<string, { label: string; text: string; border: string; surface: string; accent: string }> = {
  GREEN: { label: 'Green flag', text: 'text-signal-green', border: 'border-signal-green/30', surface: 'bg-signal-green/5', accent: '#23D18B' },
  YELLOW: { label: 'Yellow flag', text: 'text-signal-amber', border: 'border-signal-amber/30', surface: 'bg-signal-amber/5', accent: '#FFB020' },
  SC: { label: 'Safety car', text: 'text-signal-amber', border: 'border-signal-amber/40', surface: 'bg-signal-amber/10', accent: '#FFB020' },
  VSC: { label: 'Virtual safety car', text: 'text-signal-blue', border: 'border-signal-blue/40', surface: 'bg-signal-blue/10', accent: '#4DA3FF' },
  RED: { label: 'Red flag', text: 'text-signal-red', border: 'border-signal-red/40', surface: 'bg-signal-red/10', accent: '#E8001D' },
}

const SECTOR_TEXT: Record<string, string> = {
  purple: 'text-signal-purple', green: 'text-signal-green', yellow: 'text-signal-amber',
}

function lapTime(value: number | null | undefined) {
  return value == null ? '—' : formatLapTime(value)
}

function localTime(value: string | null | undefined) {
  if (!value) return 'Time unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function PracticePitWall({ snapshot, focusedDriver, onFocus }: Props) {
  const rows = snapshot.practice_tower ?? []
  const pace = snapshot.pace ?? []
  const runs = snapshot.long_runs ?? []
  const timeline = snapshot.analysis.session_timeline
  const weather = snapshot.analysis.weather
  const status = snapshot.session_status
  const flagKey = status?.flag ?? snapshot.track_status.flag
  const flag = FLAG[flagKey] ?? FLAG.GREEN
  const leader = rows[0] ?? null
  const focusRow = rows.find(row => row.code === focusedDriver) ?? null
  const noteEvents = snapshot.notes.filter(note => note.type === 'TRACK_STATUS' || note.type === 'BATTLE' || note.type === 'PIT_CYCLE')

  const markers = useMemo(
    () => (timeline?.markers ?? []).filter(marker => marker.type === 'SESSION_BEST' && marker.time_s != null),
    [timeline?.markers],
  )

  return (
    <div className="space-y-3">
      <SessionStatus snapshot={snapshot} flagKey={flagKey} flag={flag} />

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.85fr)] gap-3">
        <LeaderCard row={leader} flag={flag} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <MetricCard label="Track temperature" value={weather?.track_temperature == null ? '—' : `${weather.track_temperature}°`} unit="C" detail={trendLabel(weather?.track_temperature_trend)} accent="amber" />
          <MetricCard label="Air temperature" value={weather?.air_temperature == null ? '—' : `${weather.air_temperature}°`} unit="C" detail="Latest OpenF1 sample" />
          <MetricCard label="Conditions" value={weather?.rainfall == null ? '—' : weather.rainfall > 0 ? 'RAIN' : 'DRY'} detail={weather?.rainfall == null ? 'Waiting for weather' : `${weather.rain_periods ?? 0} confirmed rain periods`} accent={weather?.rainfall ? 'blue' : 'green'} />
          <MetricCard label="Drivers timed" value={`${rows.length}`} detail={`${snapshot.drivers_known} known in feed`} />
        </div>
      </section>

      <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
        <SectionHeader title="Session pace evolution" eyebrow="Live session record" aside={markers.length ? `${markers.length} improvements` : 'Waiting for timed laps'} />
        <BestLapChart markers={markers} />
      </section>

      <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
        <SectionHeader title="Live timing" eyebrow="Fastest completed lap" aside="Sector colours: purple · session best / green · personal best" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="border-b border-border-subtle bg-bg-elevated/40">
                {[
                  ['POS', 'w-[52px] text-center'], ['DRIVER', 'min-w-[170px]'], ['BEST LAP', 'w-[116px] text-right'],
                  ['GAP', 'w-[92px] text-right'], ['S1', 'w-[90px] text-right'], ['S2', 'w-[90px] text-right'],
                  ['S3', 'w-[90px] text-right'], ['IDEAL', 'w-[110px] text-right'], ['TYRE / STINT', 'w-[130px] text-right'],
                ].map(([label, cls]) => <th key={label} className={`px-3 py-2 font-display font-bold text-[8px] uppercase tracking-[1.2px] text-text-muted ${cls}`}>{label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/70">
              {rows.map(row => <TimingRow key={row.driver_number} row={row} focused={row.code === focusedDriver} onClick={() => onFocus(row.code === focusedDriver ? null : row.code)} />)}
              {rows.length === 0 && <tr><td colSpan={9}><EmptyState title="Waiting for the first timed lap" detail="The timing tower will rank drivers by their fastest completed lap as the feed arrives." /></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-border-subtle flex items-center justify-between gap-3 flex-wrap">
          <p className="font-mono text-[9px] text-text-muted">Ideal is the sum of each driver’s personal best sector. Timing updates with every live snapshot.</p>
          {focusedDriver && <button onClick={() => onFocus(null)} className="font-display font-bold text-[9px] uppercase tracking-[1px] text-signal-blue hover:text-text-primary">Clear {focusedDriver} focus ×</button>}
        </div>
      </section>

      {focusRow && <DriverDetail row={focusRow} />}

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <CleanPacePanel rows={pace} focusedDriver={focusedDriver} />
        <LongRunPanel rows={runs} focusedDriver={focusedDriver} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <WeatherPanel weather={weather} />
        <SessionTimelinePanel snapshot={snapshot} />
        <RaceControlPanel notes={noteEvents} status={status} inputCount={snapshot.analysis.inputs.race_control ?? 0} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <TrackOrderPanel snapshot={snapshot} focusedDriver={focusedDriver} onFocus={onFocus} />
        <RadioFeed clips={snapshot.radio} focusedDriver={focusedDriver} />
      </section>

      <details className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden group">
        <summary className="list-none cursor-pointer px-3 py-2 flex items-center justify-between gap-2 hover:bg-bg-elevated/50">
          <span><span className="font-display font-bold text-[10px] uppercase tracking-[1.3px] text-text-secondary">Feed diagnostics</span><span className="font-mono text-[9px] text-text-muted ml-2">transport and topic counts</span></span>
          <span className="font-mono text-[10px] text-text-muted group-open:rotate-180 transition-transform">⌄</span>
        </summary>
        <div className="p-3 border-t border-border-subtle">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <Diag label="Transport" value={`${snapshot.feed.mode.toUpperCase()} · ${snapshot.feed.connected ? 'connected' : 'disconnected'}`} />
            <Diag label="Messages" value={snapshot.feed.messages_total.toLocaleString()} />
            <Diag label="Latest feed message" value={snapshot.feed.last_message_age_s == null ? '—' : `${snapshot.feed.last_message_age_s.toFixed(1)}s ago`} />
            <Diag label="Token renewals" value={`${snapshot.feed.renewals}`} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {Object.entries(snapshot.feed.documents).map(([topic, count]) => <Diag key={topic} label={topic} value={count.toLocaleString()} />)}
          </div>
          {snapshot.feed.gaps_observed.length > 0 && <p className="mt-3 font-mono text-[9px] text-text-muted">Observed gaps: {snapshot.feed.gaps_observed.slice(-5).map(gap => `${gap.seconds}s at L${gap.at_lap}`).join(' · ')}</p>}
        </div>
      </details>
    </div>
  )
}

function SessionStatus({ snapshot, flagKey, flag }: { snapshot: LiveSnapshot; flagKey: string; flag: typeof FLAG[string] }) {
  const sessionName = snapshot.session_name ?? snapshot.session_type ?? 'Live session'
  const location = snapshot.location ?? 'Circuit location unavailable'
  return (
    <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-black text-[20px] uppercase tracking-[-0.4px] text-text-primary">{location}</span>
            <span className="px-1.5 py-0.5 border border-border-default rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[1px] text-text-secondary">{sessionName}</span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-text-muted">SESSION {snapshot.session_key ?? '—'} · updated {localTime(snapshot.generated_at)} local</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-2 px-2.5 py-1 border rounded-[3px] ${flag.border} ${flag.surface}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: flag.accent }} />
            <span className={`font-display font-bold text-[10px] uppercase tracking-[1px] ${flag.text}`}>{flag.label}</span>
          </span>
          {snapshot.feed.stale && <span className="px-2 py-1 border border-signal-amber/40 bg-signal-amber/10 rounded-[3px] font-display font-bold text-[9px] uppercase text-signal-amber">Stale feed</span>}
          {snapshot.chequered && <span className="px-2 py-1 border border-border-default rounded-[3px] font-display font-bold text-[9px] uppercase text-text-primary">Chequered</span>}
        </div>
      </div>
      <div className="h-[2px] w-full" style={{ backgroundColor: flag.accent, opacity: 0.75 }} />
      <div className="grid grid-cols-3 divide-x divide-border-subtle border-t border-border-subtle">
        <InlineMetric label="Red flags" value={`${snapshot.session_status?.red_flags ?? 0}`} />
        <InlineMetric label="Time under red" value={`${snapshot.session_status?.minutes_under_red ?? 0} min`} />
        <InlineMetric label="Feed delay" value={snapshot.feed.last_message_age_s == null ? '—' : `${snapshot.feed.last_message_age_s.toFixed(1)}s`} />
      </div>
      <span className="sr-only">Current track flag: {flagKey}</span>
    </section>
  )
}

function LeaderCard({ row, flag }: { row: PracticeTowerRow | null; flag: typeof FLAG[string] }) {
  return (
    <section className="relative bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden min-h-[156px]">
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: row?.colour ? `#${row.colour}` : flag.accent }} />
      <div className="p-4 pl-5 h-full flex flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">Session fastest</div>
            {row ? <div className="font-display font-black text-[26px] uppercase text-text-primary leading-none mt-1">{row.code}<span className="ml-2 font-mono font-normal text-[11px] text-text-muted">P{row.position}</span></div> : <div className="font-display font-bold text-[16px] text-text-muted mt-2">Awaiting first lap</div>}
          </div>
          {row && <span className="px-1.5 py-0.5 border border-signal-purple/30 bg-signal-purple/10 rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[1px] text-signal-purple">Lap {row.best_lap_number}</span>}
        </div>
        <div className="flex items-end justify-between gap-4">
          <div className="font-mono font-bold text-[30px] leading-none tracking-[-1px] tabular-nums text-text-primary">{row ? lapTime(row.best_lap_s) : '—:—.———'}</div>
          {row && <div className="text-right"><div className="font-mono font-bold text-[12px] text-text-secondary">{row.clean_laps} clean laps</div><div className="font-mono text-[9px] text-text-muted mt-1">{row.team ?? row.compound ?? 'Session best'}</div></div>}
        </div>
      </div>
    </section>
  )
}

function MetricCard({ label, value, unit, detail, accent }: { label: string; value: string; unit?: string; detail: string; accent?: 'amber' | 'blue' | 'green' }) {
  const color = accent === 'amber' ? 'text-signal-amber' : accent === 'blue' ? 'text-signal-blue' : accent === 'green' ? 'text-signal-green' : 'text-text-primary'
  return <div className="bg-bg-panel border border-border-subtle rounded-[4px] px-3 py-3 flex flex-col justify-between min-h-[74px]">
    <div className="font-display font-bold text-[8px] uppercase tracking-[1.2px] text-text-muted">{label}</div>
    <div className={`font-mono font-bold text-[20px] leading-none tabular-nums ${color}`}>{value}<span className="text-[10px] ml-0.5 font-normal">{unit}</span></div>
    <div className="font-mono text-[8px] text-text-muted truncate">{detail}</div>
  </div>
}

function BestLapChart({ markers }: { markers: NonNullable<LiveSnapshot['analysis']['session_timeline']>['markers'] }) {
  const points = markers.filter(marker => marker.time_s != null)
  if (!points.length) return <EmptyState title="No session-best laps yet" detail="As lap times arrive, each new session record will be plotted here." />

  const width = 900
  const height = 138
  const pad = { left: 46, right: 18, top: 16, bottom: 26 }
  const times = points.map(point => point.time_s as number)
  const min = Math.min(...times)
  const max = Math.max(...times)
  const span = max - min || 1
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const coords = points.map((point, index) => ({
    x: pad.left + (points.length === 1 ? innerW / 2 : index / (points.length - 1) * innerW),
    y: pad.top + (max - (point.time_s as number)) / span * innerH,
    point,
  }))
  const path = coords.map((coord, index) => `${index ? 'L' : 'M'} ${coord.x} ${coord.y}`).join(' ')

  return <div className="px-3 pt-2 pb-1">
    <div className="flex items-center justify-between font-mono text-[8px] text-text-muted mb-1"><span>Lap time · seconds</span><span>Record progression · timestamps ordered by lap completion</span></div>
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-[116px]" role="img" aria-label="Progression of session fastest lap times">
        {[0, 0.5, 1].map((fraction, index) => {
          const y = pad.top + innerH * fraction
          const value = max - span * fraction
          return <g key={index}><line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#252D3A" strokeDasharray="2 4" /><text x={pad.left - 7} y={y + 3} textAnchor="end" fill="#8A94A6" fontSize="8" fontFamily="monospace">{value.toFixed(3)}</text></g>
        })}
        <path d={path} fill="none" stroke="#FFB020" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((coord, index) => <g key={`${coord.point.at}-${index}`}>
          <circle cx={coord.x} cy={coord.y} r={index === coords.length - 1 ? 4 : 2.4} fill={index === coords.length - 1 ? '#FFB020' : '#F0F2F5'} stroke="#0B0D12" strokeWidth="1.5">
            <title>{`${coord.point.code ?? 'Driver'} · lap ${coord.point.lap_number ?? '—'} · ${lapTime(coord.point.time_s)}`}</title>
          </circle>
        </g>)}
        <text x={pad.left} y={height - 5} fill="#8A94A6" fontSize="8" fontFamily="monospace">{points[0].code ?? 'START'}</text>
        <text x={width - pad.right} y={height - 5} textAnchor="end" fill="#FFB020" fontSize="8" fontFamily="monospace">{points[points.length - 1].code ?? 'LATEST RECORD'}</text>
      </svg>
    </div>
  </div>
}

function TimingRow({ row, focused, onClick }: { row: PracticeTowerRow; focused: boolean; onClick: () => void }) {
  const team = row.colour ? `#${row.colour}` : '#8A94A6'
  const gap = row.gap_to_p1 == null ? '—' : row.gap_to_p1 === 0 ? '—' : `+${row.gap_to_p1.toFixed(3)}`
  return <tr onClick={onClick} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick() } }} tabIndex={0} role="button" aria-pressed={focused} className={`cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-bg-elevated ${focused ? 'bg-bg-elevated' : 'hover:bg-bg-elevated/50'}`}>
    <td className="px-3 py-2.5 text-center"><span className={`font-mono font-bold text-[12px] tabular-nums ${row.position === 1 ? 'text-signal-amber' : 'text-text-muted'}`}>{String(row.position).padStart(2, '0')}</span></td>
    <td className="px-3 py-2.5"><div className="flex items-center gap-2.5 min-w-0"><span className="w-[3px] h-8 rounded-full shrink-0" style={{ backgroundColor: team }} /><div className="min-w-0"><div className="font-display font-black text-[13px] uppercase tracking-[0.4px] text-text-primary">{row.code}<span className="font-normal text-[9px] ml-2 text-text-muted">{row.team ?? ''}</span></div><div className="font-mono text-[8px] text-text-muted mt-0.5">L{row.best_lap_number} · {row.laps} laps · {row.clean_laps} clean</div></div></div></td>
    <td className="px-3 py-2.5 text-right"><span className="font-mono font-bold text-[12px] tabular-nums text-text-primary">{lapTime(row.best_lap_s)}</span></td>
    <td className={`px-3 py-2.5 text-right font-mono text-[10px] tabular-nums ${row.position === 1 ? 'text-text-muted' : 'text-text-secondary'}`}>{gap}</td>
    {(['sector1', 'sector2', 'sector3'] as const).map((sector, index) => <td key={sector} className="px-3 py-2.5 text-right"><SectorValue row={row} sector={sector} segmentKey={`seg${index + 1}` as 'seg1' | 'seg2' | 'seg3'} /></td>)}
    <td className="px-3 py-2.5 text-right"><span className="font-mono font-bold text-[10px] tabular-nums text-text-secondary">{lapTime(row.ideal_lap?.total)}</span>{row.ideal_lap && row.best_lap_s - row.ideal_lap.total > 0.001 && <span className="block font-mono text-[8px] text-text-muted">+{(row.best_lap_s - row.ideal_lap.total).toFixed(3)}</span>}</td>
    <td className="px-3 py-2.5 text-right"><span className="inline-flex items-center justify-end gap-1.5"><TyreDot compound={row.compound} /><span className="font-mono text-[9px] text-text-secondary">{row.compound ?? '—'}{row.tyre_age != null ? ` · ${row.tyre_age}L` : ''}</span></span></td>
  </tr>
}

function SectorValue({ row, sector, segmentKey }: { row: PracticeTowerRow; sector: 'sector1' | 'sector2' | 'sector3'; segmentKey: 'seg1' | 'seg2' | 'seg3' }) {
  const result = row.sectors[sector]
  const segments = row.segments?.[segmentKey] ?? []
  return <div className="inline-flex flex-col items-end" title={`Mini-sector codes: ${segments.join(', ') || 'not available'}`}>
    <span className={`font-mono text-[10px] tabular-nums ${SECTOR_TEXT[result.colour ?? ''] ?? 'text-text-muted'}`}>{result.time == null ? '—.———' : result.time.toFixed(3)}</span>
    <span className="mt-1 inline-flex gap-px">{segments.slice(0, 20).map((code, index) => <i key={index} className="w-[3px] h-[3px]" style={{ backgroundColor: segmentColor(code) }} />)}</span>
  </div>
}

function DriverDetail({ row }: { row: PracticeTowerRow }) {
  const sectors = [row.sectors.sector1, row.sectors.sector2, row.sectors.sector3]
  return <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
    <SectionHeader title={`${row.code} lap detail`} eyebrow={row.team ?? 'Selected driver'} aside={`Lap ${row.best_lap_number} · ${row.compound ?? 'tyre unknown'}`} />
    <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-border-subtle">
      {sectors.map((sector, index) => <InlineMetric key={index} label={`Sector ${index + 1}`} value={sector.time == null ? '—' : `${sector.time.toFixed(3)}s`} valueClass={SECTOR_TEXT[sector.colour ?? ''] ?? 'text-text-primary'} />)}
      <InlineMetric label="Ideal lap" value={lapTime(row.ideal_lap?.total)} />
    </div>
    <div className="px-3 py-2.5 border-t border-border-subtle flex items-center justify-between gap-3 flex-wrap">
      <span className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted">Speed traps · km/h</span>
      <div className="flex gap-5 font-mono text-[10px] text-text-secondary">{[
        ['Intermediate 1', row.speed_traps?.i1_speed], ['Intermediate 2', row.speed_traps?.i2_speed], ['Finish line', row.speed_traps?.st_speed],
      ].map(([label, value]) => <span key={String(label)}>{label} <b className="text-text-primary">{value == null ? '—' : value}</b></span>)}</div>
    </div>
  </section>
}

function CleanPacePanel({ rows, focusedDriver }: { rows: NonNullable<LiveSnapshot['pace']>; focusedDriver: string | null }) {
  const visible = focusedDriver ? rows.filter(row => row.code === focusedDriver) : rows.slice(0, 8)
  return <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
    <SectionHeader title="Clean lap pace" eyebrow="Median of representative laps" aside={`${rows.length} drivers`} />
    {visible.length ? <div className="divide-y divide-border-subtle/70">{visible.map((row, index) => <div key={row.driver_number} className="px-3 py-2 grid grid-cols-[32px_minmax(0,1fr)_88px_88px_54px] gap-2 items-center">
      <span className="font-mono text-[9px] text-text-muted">{String(index + 1).padStart(2, '0')}</span>
      <span className="font-display font-bold text-[11px] text-text-primary">{row.code}<span className="ml-2 font-mono font-normal text-[8px] text-text-muted">n={row.sample_size}</span></span>
      <span className="text-right font-mono font-bold text-[10px] text-text-primary">{lapTime(row.median_clean_lap_s)}</span>
      <span className="text-right font-mono text-[9px] text-text-muted">best {lapTime(row.fastest_clean_lap_s)}</span>
      <span className="text-right"><ConfidenceChip confidence={row.confidence} /></span>
    </div>)}</div> : <EmptyState title={focusedDriver ? `No clean pace for ${focusedDriver} yet` : 'Clean pace is not available yet'} detail="The feed needs representative completed laps before this comparison is meaningful." />}
    <PanelFoot>Out-laps, in-laps, neutralised laps and statistical outliers are excluded.</PanelFoot>
  </section>
}

function LongRunPanel({ rows, focusedDriver }: { rows: LongRunRow[]; focusedDriver: string | null }) {
  const shown = focusedDriver ? rows.filter(row => row.code === focusedDriver) : rows.slice(0, 8)
  return <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
    <SectionHeader title="Long-run pace" eyebrow="Consecutive clean laps · race simulation" aside={`${shown.length} runs`} />
    {shown.length ? <div className="divide-y divide-border-subtle/70">{shown.map(run => <LongRunRowView key={`${run.driver_number}-${run.lap_start}`} run={run} />)}</div> : <EmptyState title={focusedDriver ? `No long run for ${focusedDriver} yet` : 'Long runs will appear as stints develop'} detail="Only sustained sequences of clean laps are shown; short runs are not labelled as race simulations." />}
    <PanelFoot>Median lap time is measured over the displayed run. Confidence reflects sample size.</PanelFoot>
  </section>
}

function LongRunRowView({ run }: { run: LongRunRow }) {
  return <div className="px-3 py-2.5 grid grid-cols-[52px_minmax(0,1fr)_auto] gap-3 items-center">
    <span className="font-display font-black text-[12px] text-text-primary">{run.code}</span>
    <div className="min-w-0"><div className="flex items-center gap-2"><TyreDot compound={run.compound} /><span className="font-display font-bold text-[9px] uppercase text-text-secondary">{run.compound ?? 'Unknown compound'}</span><span className="font-mono text-[9px] text-text-muted">L{run.lap_start}–{run.lap_end} · {run.laps} laps</span></div><div className="mt-1.5 h-[3px] w-full bg-bg-elevated rounded-full overflow-hidden"><div className="h-full bg-signal-blue/70" style={{ width: `${Math.min(run.laps / 20 * 100, 100)}%` }} /></div></div>
    <div className="text-right"><div className="font-mono font-bold text-[11px] text-text-primary">{lapTime(run.median_s)}</div><div className="mt-1"><ConfidenceChip confidence={run.confidence} /></div></div>
  </div>
}

function WeatherPanel({ weather }: { weather: LiveSnapshot['analysis']['weather'] }) {
  return <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
    <SectionHeader title="Track conditions" eyebrow="Latest weather telemetry" />
    <div className="grid grid-cols-2 divide-x divide-y divide-border-subtle">
      <InlineMetric label="Track temperature" value={weather?.track_temperature == null ? '—' : `${weather.track_temperature}°C`} valueClass="text-signal-amber" />
      <InlineMetric label="Air temperature" value={weather?.air_temperature == null ? '—' : `${weather.air_temperature}°C`} />
      <InlineMetric label="Rainfall sensor" value={weather?.rainfall == null ? '—' : weather.rainfall > 0 ? 'WET' : 'DRY'} valueClass={weather?.rainfall ? 'text-signal-blue' : 'text-signal-green'} />
      <InlineMetric label="Confirmed rain periods" value={`${weather?.rain_periods ?? 0}`} />
    </div>
    <PanelFoot>{weather?.note ?? 'Weather telemetry is published roughly once per minute.'}</PanelFoot>
  </section>
}

function SessionTimelinePanel({ snapshot }: { snapshot: LiveSnapshot }) {
  const markers = (snapshot.analysis.session_timeline?.markers ?? []).filter(marker => marker.type === 'SESSION_BEST').slice(-6).reverse()
  const bands = (snapshot.session_status?.periods ?? []).slice(-4).reverse()
  return <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
    <SectionHeader title="Session events" eyebrow="Race control · live session clock" aside={`${snapshot.analysis.inputs.race_control ?? 0} messages`} />
    {markers.length || bands.length ? <div className="divide-y divide-border-subtle/70">
      {bands.map((period, index) => <EventRow key={`flag-${period.start}-${index}`} kind={period.flag} time={localTime(period.start)} title={`${period.flag} flag period`} detail={`${Math.round(period.duration_s)}s · ${localTime(period.end)} end`} />)}
      {markers.map((marker, index) => <EventRow key={`best-${marker.at}-${index}`} kind="BEST" time={localTime(marker.at)} title={`${marker.code ?? 'Driver'} set session best`} detail={`Lap ${marker.lap_number ?? '—'} · ${lapTime(marker.time_s)}`} />)}
    </div> : <EmptyState title="No session events recorded" detail="Flag changes and session records will appear here as they happen." />}
  </section>
}

function RaceControlPanel({ notes, status, inputCount }: { notes: LiveNote[]; status: LiveSnapshot['session_status']; inputCount: number }) {
  const shown = notes.slice(0, 5)
  return <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
    <SectionHeader title="Race control" eyebrow="Official messages" aside={`${inputCount} received`} />
    {shown.length ? <div className="divide-y divide-border-subtle/70">{shown.map(note => <div key={note.id} className="px-3 py-2.5 flex gap-2.5">
      <span className={`mt-1 w-1 h-6 rounded-full shrink-0 ${note.severity === 'High' ? 'bg-signal-red' : note.severity === 'Medium' ? 'bg-signal-amber' : 'bg-border-default'}`} />
      <div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="font-display font-bold text-[10px] text-text-primary">{note.title}</span><ConfidenceChip confidence={note.confidence} /></div><p className="font-mono text-[9px] text-text-secondary leading-relaxed mt-0.5">{note.message}</p></div>
    </div>)}</div> : <EmptyState title="No new race-control messages" detail={status?.source ?? 'The session is running without a published control message.'} />}
  </section>
}

function TrackOrderPanel({ snapshot, focusedDriver, onFocus }: { snapshot: LiveSnapshot; focusedDriver: string | null; onFocus: (code: string | null) => void }) {
  const rows = snapshot.tower.slice(0, 10)
  return <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
    <SectionHeader title="Order on track" eyebrow="Physical position · not pace ranking" aside={`${snapshot.tower.length} cars`} />
    {rows.length ? <div className="divide-y divide-border-subtle/70">{rows.map(row => <button key={row.driver_number} onClick={() => onFocus(row.code === focusedDriver ? null : row.code)} className={`w-full px-3 py-2 text-left grid grid-cols-[32px_4px_minmax(0,1fr)_88px_84px] items-center gap-2 hover:bg-bg-elevated/50 ${focusedDriver === row.code ? 'bg-bg-elevated' : ''}`}>
      <span className="font-mono text-[10px] text-text-muted">P{row.position}</span><span className="h-5 rounded-full" style={{ backgroundColor: row.colour ? `#${row.colour}` : '#4A5568' }} /><span className="font-display font-bold text-[11px] text-text-primary">{row.code}<span className="ml-2 font-mono font-normal text-[8px] text-text-muted">{row.gap_to_leader == null ? '' : typeof row.gap_to_leader === 'number' ? `+${row.gap_to_leader.toFixed(1)}` : row.gap_to_leader}</span></span><span className="text-right font-mono text-[9px] text-text-secondary">{lapTime(row.last_lap_s)}</span><span className="text-right font-mono text-[9px] text-text-muted">{row.compound ?? '—'} {row.stint_laps == null ? '' : `${row.stint_laps}L`}</span>
    </button>)}</div> : <EmptyState title="Track order unavailable" detail="No position messages have arrived yet." />}
    <PanelFoot>OpenF1 position is circuit order at the latest position update.</PanelFoot>
  </section>
}

function EventRow({ kind, time, title, detail }: { kind: string; time: string; title: string; detail: string }) {
  const color = kind === 'RED' ? 'bg-signal-red' : kind === 'GREEN' ? 'bg-signal-green' : kind === 'BEST' ? 'bg-signal-purple' : 'bg-signal-amber'
  return <div className="px-3 py-2.5 flex gap-2.5 items-start"><span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${color}`} /><div className="min-w-0 flex-1"><div className="flex gap-2 justify-between"><span className="font-display font-bold text-[10px] text-text-primary">{title}</span><span className="font-mono text-[8px] text-text-muted shrink-0">{time}</span></div><div className="font-mono text-[8px] text-text-muted mt-0.5">{detail}</div></div></div>
}

function InlineMetric({ label, value, valueClass = 'text-text-primary' }: { label: string; value: string; valueClass?: string }) {
  return <div className="px-3 py-2.5"><div className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted">{label}</div><div className={`font-mono font-bold text-[12px] tabular-nums mt-1 ${valueClass}`}>{value}</div></div>
}

function Diag({ label, value }: { label: string; value: string }) {
  return <div className="px-2.5 py-2 bg-bg-elevated/50 border border-border-subtle rounded-[3px] min-w-0"><div className="font-display text-[7px] uppercase tracking-[1px] text-text-muted truncate">{label}</div><div className="font-mono text-[9px] text-text-secondary mt-1 truncate">{value}</div></div>
}

function TyreDot({ compound }: { compound: string | null }) {
  const color = compound?.toUpperCase() === 'SOFT' ? '#E8001D' : compound?.toUpperCase() === 'MEDIUM' ? '#FFB020' : compound?.toUpperCase() === 'HARD' ? '#F0F2F5' : compound?.toUpperCase() === 'INTERMEDIATE' ? '#23D18B' : compound?.toUpperCase() === 'WET' ? '#4DA3FF' : '#4A5568'
  return <span className="w-2 h-2 rounded-full inline-block shrink-0 border border-black/20" style={{ backgroundColor: color }} title={compound ?? 'Compound unavailable'} />
}

function SectionHeader({ title, eyebrow, aside }: { title: string; eyebrow?: string; aside?: string }) {
  return <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between gap-3"><div className="flex items-baseline gap-2 min-w-0"><span className="font-display font-bold text-[10px] uppercase tracking-[1.3px] text-text-secondary">{title}</span>{eyebrow && <span className="font-mono text-[8px] text-text-muted truncate">{eyebrow}</span>}</div>{aside && <span className="font-mono text-[8px] text-text-muted text-right shrink-0">{aside}</span>}</div>
}

function PanelFoot({ children }: { children: ReactNode }) {
  return <div className="px-3 py-2 border-t border-border-subtle font-mono text-[8px] leading-relaxed text-text-muted">{children}</div>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="px-4 py-6 text-center"><div className="font-display font-bold text-[10px] uppercase tracking-[1px] text-text-secondary">{title}</div><div className="font-mono text-[9px] text-text-muted mt-1.5">{detail}</div></div>
}

function trendLabel(trend: string | null | undefined) {
  if (!trend) return 'Latest OpenF1 sample'
  if (trend === 'rising') return 'Track temperature rising'
  if (trend === 'falling') return 'Track temperature falling'
  return 'Track temperature steady'
}

function segmentColor(code: number) {
  if (code === 2048) return '#FFB020'
  if (code === 2049) return '#23D18B'
  if (code === 2051) return '#D58CFF'
  if (code === 2064) return '#4DA3FF'
  return '#374151'
}
