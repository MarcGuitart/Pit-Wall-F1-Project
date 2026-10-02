'use client'

import type { LiveSnapshot, PracticeTowerRow } from '@/types/live'
import type { ReactNode } from 'react'
import { RadioFeed } from '@/components/live/RadioFeed'

type Props = { snapshot: LiveSnapshot; onFocus: (code: string | null) => void; focusedDriver: string | null }

const flagTone: Record<string, string> = {
  GREEN: 'text-signal-green border-signal-green/40 bg-signal-green/5',
  YELLOW: 'text-signal-amber border-signal-amber/40 bg-signal-amber/5',
  SC: 'text-signal-amber border-signal-amber/50 bg-signal-amber/10',
  VSC: 'text-signal-amber border-signal-amber/50 bg-signal-amber/10',
  RED: 'text-signal-red border-signal-red/50 bg-signal-red/10',
}
const sectorTone: Record<string, string> = {
  purple: 'text-[#d58cff]', green: 'text-signal-green', yellow: 'text-signal-amber',
}
const time = (s: number | null | undefined) => s == null ? '—' : `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`
const clock = (s: string | null | undefined) => s ? new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }) + ' UTC' : 'time pending'

export function PracticePitWall({ snapshot, focusedDriver, onFocus }: Props) {
  const practice = snapshot.practice_tower ?? []
  const runs = snapshot.long_runs ?? []
  const status = snapshot.session_status
  const weather = snapshot.analysis.weather
  const timeline = snapshot.analysis.session_timeline
  const active = status?.flag ?? snapshot.track_status.flag
  const eventful = active === 'RED' || active === 'SC' || active === 'VSC'

  return <div className="space-y-4">
    <section className={`rounded-[4px] border overflow-hidden ${flagTone[active] ?? flagTone.GREEN} ${eventful ? 'track-alert' : ''}`} aria-live="polite">
      <div className="flex items-stretch">
        <div className={`w-1.5 shrink-0 ${active === 'RED' ? 'bg-signal-red' : active === 'GREEN' ? 'bg-signal-green' : 'bg-signal-amber'}`} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 flex-1">
          <div><div className="font-display font-black uppercase text-[20px] tracking-[1px]">{active === 'SC' ? 'Safety car' : active === 'VSC' ? 'Virtual safety car' : `${active} FLAG`}</div>
            <div className="font-mono text-[10px] opacity-70 mt-1">{status?.source ?? snapshot.track_status.source}</div></div>
          <div className="ml-auto flex gap-6">
            <MiniStat label="Session time" value={clock(snapshot.generated_at)} />
            <MiniStat label="Red flags" value={`${status?.red_flags ?? 0}`} />
            <MiniStat label="Time under red" value={`${status?.minutes_under_red ?? 0} min`} />
          </div>
        </div>
      </div>
    </section>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <Metric label="Air" value={weather?.air_temperature == null ? '—' : `${weather.air_temperature}°C`} />
      <Metric label="Track" value={weather?.track_temperature == null ? '—' : `${weather.track_temperature}°C`} detail={weather?.track_temperature_trend ?? undefined} />
      <Metric label="Rain" value={weather?.rainfall == null ? '—' : weather.rainfall ? 'RAIN' : 'DRY'} detail={`${weather?.rain_periods ?? 0} detected periods`} />
      <Metric label="Data received" value={`${snapshot.feed.messages_total.toLocaleString()}`} detail={`${snapshot.drivers_known} drivers · ${snapshot.feed.last_message_age_s ?? '—'}s ago`} />
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] gap-4 items-start">
      <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
        <PanelHead title="Practice classification" aside={`${practice.length} timed drivers · ranked by best lap`} />
        <div className="grid grid-cols-[28px_minmax(90px,1fr)_78px_54px_54px_54px_62px_52px] gap-2 px-3 py-2 border-b border-border-subtle">
          {['P', 'Driver', 'Best lap', 'S1', 'S2', 'S3', 'Ideal', 'Tyre'].map((x, i) => <span key={x} className={`font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted ${i > 1 ? 'text-right' : ''}`}>{x}</span>)}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {practice.length === 0 ? <Empty>Waiting for completed timed laps. Track order stays separate from pace.</Empty> : practice.map(row => <PracticeRow key={row.driver_number} row={row} focused={row.code === focusedDriver} onClick={() => onFocus(row.code === focusedDriver ? null : row.code)} />)}
        </div>
        <div className="px-3 py-2 border-t border-border-subtle font-mono text-[9px] text-text-muted">Sectors: purple = session best, green = personal best, yellow = slower than personal best. Ideal lap combines each driver’s best sectors.</div>
      </section>

      <div className="space-y-4">
        <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
          <PanelHead title="Long runs" aside="consecutive clean laps" />
          {runs.length === 0 ? <Empty>No qualifying long runs yet; the feed needs a sustained clean stint.</Empty> : runs.map(run => <div key={`${run.driver_number}-${run.lap_start}`} className="grid grid-cols-[48px_1fr_auto] gap-3 items-center px-3 py-2 border-t border-border-subtle/60">
            <span className="font-display font-bold text-[12px] text-text-primary">{run.code}</span><span className="font-mono text-[10px] text-text-secondary">L{run.lap_start}–{run.lap_end} · {run.laps} laps · {run.compound ?? 'tyre n/a'}</span><span className="font-mono text-[11px] text-text-primary">{time(run.median_s)}</span>
          </div>)}
        </section>

        <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
          <PanelHead title="Session timeline" aside="UTC · shared session clock" />
          <div className="p-3">
            {(timeline?.bands ?? []).length ? <div className="space-y-2">{timeline!.bands.slice(-8).reverse().map((band, i) => <div key={`${band.start}-${i}`} className="flex items-center gap-2 text-[10px]">
              <span className={`w-2 h-2 rounded-full ${band.flag === 'RED' ? 'bg-signal-red' : band.flag === 'GREEN' ? 'bg-signal-green' : 'bg-signal-amber'}`} />
              <span className="font-display font-bold text-text-primary w-14">{band.flag}</span><span className="font-mono text-text-secondary">{clock(band.start)} → {clock(band.end)}</span><span className="ml-auto font-mono text-text-muted">{Math.round(band.duration_s)}s</span>
            </div>)}</div> : <Empty>Green track · no flag changes recorded yet.</Empty>}
            {(timeline?.markers ?? []).filter(x => x.type === 'SESSION_BEST').slice(-5).reverse().map((marker, i) => <div key={`${marker.at}-${i}`} className="mt-2 pt-2 border-t border-border-subtle/60 flex gap-2 font-mono text-[9px] text-text-muted"><span className="text-[#d58cff]">BEST</span><span>{clock(marker.at)}</span><span>{marker.code} L{marker.lap_number}</span><span className="ml-auto text-text-secondary">{time(marker.time_s)}</span></div>)}
          </div>
        </section>

        <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
          <PanelHead title="Order on track" aside="live position · not pace ranking" />
          {snapshot.tower.slice(0, 8).map(row => <div key={row.driver_number} className="grid grid-cols-[30px_1fr_68px_56px] px-3 py-1.5 border-t border-border-subtle/50 items-center gap-2">
            <span className="font-mono text-[10px] text-text-muted">{row.position}</span><span className="font-display font-bold text-[11px] text-text-primary">{row.code}</span><span className="text-right font-mono text-[10px] text-text-secondary">{row.last_lap_s ? time(row.last_lap_s) : '—'}</span><span className="text-right font-mono text-[9px] text-text-muted">{row.compound ?? '—'} {row.stint_laps ?? ''}</span>
          </div>)}
          {snapshot.tower.length === 0 && <Empty>No position messages received yet.</Empty>}
        </section>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden"><PanelHead title="Race control" aside={`${snapshot.analysis.inputs.race_control ?? 0} messages`} />
        {snapshot.notes.filter(n => n.type === 'TRACK_STATUS').slice(0, 6).map(n => <div key={n.id} className="px-3 py-2 border-t border-border-subtle/60"><div className="font-display font-bold text-[10px] text-text-primary">{n.title}</div><div className="font-mono text-[9px] text-text-muted mt-0.5">{n.message}</div></div>)}
        {!snapshot.notes.some(n => n.type === 'TRACK_STATUS') && <Empty>No race control messages received.</Empty>}
      </section>
      <section className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden"><PanelHead title="Live feed inventory" aside={`${snapshot.feed.mode.toUpperCase()} · ${snapshot.feed.connected ? 'connected' : 'disconnected'}`} />
        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">{Object.entries(snapshot.feed.documents).map(([topic, count]) => <div key={topic} className="border border-border-subtle rounded-[3px] p-2"><div className="font-mono text-[9px] uppercase text-text-muted">{topic}</div><div className="font-mono font-bold text-[13px] text-text-primary mt-1">{count}</div></div>)}</div>
      </section>
    </div>
    <RadioFeed clips={snapshot.radio} focusedDriver={focusedDriver} />
    {weather?.note && <p className="font-mono text-[9px] text-text-muted">Weather method: {weather.note}</p>}
  </div>
}

function PracticeRow({ row, focused, onClick }: { row: PracticeTowerRow; focused: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`w-full text-left grid grid-cols-[28px_minmax(90px,1fr)_78px_54px_54px_54px_62px_52px] gap-2 px-3 py-2 items-center hover:bg-bg-elevated/60 ${focused ? 'bg-bg-elevated' : ''}`}>
    <span className="font-mono text-[11px] text-text-muted">{row.position}</span><span className="min-w-0"><span className="flex items-center gap-2"><i className="w-[3px] h-4" style={{ background: row.colour ? `#${row.colour}` : '#4A5568' }} /><b className="font-display text-[12px] text-text-primary">{row.code}</b></span><span className="block font-mono text-[8px] text-text-muted mt-0.5">+{row.gap_to_p1?.toFixed(3) ?? '0.000'} · L{row.best_lap_number} · {row.clean_laps} clean</span><span className="block font-mono text-[8px] text-text-muted mt-0.5">I1 {row.speed_traps?.i1_speed ?? '—'} · I2 {row.speed_traps?.i2_speed ?? '—'} · ST {row.speed_traps?.st_speed ?? '—'} km/h</span></span>
    <span className="text-right"><b className="font-mono text-[11px] text-text-primary">{time(row.best_lap_s)}</b><small className="block font-mono text-[8px] text-text-muted">{row.laps} laps</small></span>
    {(['sector1', 'sector2', 'sector3'] as const).map((k, i) => <span key={k} className={`text-right font-mono text-[9px] ${sectorTone[row.sectors[k].colour ?? ''] ?? 'text-text-muted'}`} title={`Mini-sector codes: ${(row.segments?.[`seg${i + 1}` as 'seg1' | 'seg2' | 'seg3'] ?? []).join(', ') || 'not available'}`}><span className="block">{time(row.sectors[k].time)}</span><span className="mt-1 flex justify-end gap-px">{(row.segments?.[`seg${i + 1}` as 'seg1' | 'seg2' | 'seg3'] ?? []).map((code, j) => <i key={j} className="h-1 w-1 rounded-[1px]" style={{ backgroundColor: code === 2048 ? '#fbbf24' : code === 2049 ? '#22c55e' : code === 2051 ? '#d58cff' : code === 2064 ? '#60a5fa' : '#374151' }} />)}</span></span>)}
    <span className="text-right font-mono text-[9px] text-text-secondary">{time(row.ideal_lap?.total)}</span><span className="text-right font-mono text-[9px] text-text-secondary">{row.compound ?? '—'} {row.tyre_age ?? ''}</span>
  </button>
}
function MiniStat({ label, value }: { label: string; value: string }) { return <div><div className="font-display text-[8px] uppercase tracking-[1px] opacity-70">{label}</div><div className="font-mono font-bold text-[12px] mt-0.5">{value}</div></div> }
function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) { return <div className="bg-bg-panel border border-border-subtle rounded-[4px] p-3"><div className="font-display font-bold text-[8px] uppercase tracking-[1.3px] text-text-muted">{label}</div><div className="font-mono font-bold text-[17px] text-text-primary mt-1">{value}</div>{detail && <div className="font-mono text-[9px] text-text-muted mt-0.5">{detail}</div>}</div> }
function PanelHead({ title, aside }: { title: string; aside?: string }) { return <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between gap-2"><span className="font-display font-bold text-[10px] uppercase tracking-[1.3px] text-text-secondary">{title}</span>{aside && <span className="font-mono text-[9px] text-text-muted text-right">{aside}</span>}</div> }
function Empty({ children }: { children: ReactNode }) { return <div className="px-3 py-5 text-center font-mono text-[10px] text-text-muted">{children}</div> }
