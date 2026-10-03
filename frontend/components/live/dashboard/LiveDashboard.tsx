'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { archivo } from '@/lib/fonts'
import s from './live.module.css'
import { RaceLapCharts, LapTimeEvolutionChart } from '@/components/charts/LapCharts'
import { LiveEngineer } from './LiveEngineer'
import { Predictions } from './Predictions'
import { bandsFromLaps, driversFromLive, formatLap, median, type NeutralBand } from '@/lib/lapCharts'
import type { LiveConnection as ConnectionState } from '@/hooks/useLiveSession'
import type { LiveDashboard as Dash, LiveSnapshot, PracticeTowerRow, TowerRow } from '@/types/live'


/**
 * The live pit wall — Claude Design's "Live Mode" layout on the site's dark
 * ground. Every panel reads the SSE snapshot; nothing is simulated. Where the
 * feed has not delivered something yet the panel says so instead of drawing a
 * placeholder that looks like data.
 */

type Props = {
  snapshot: LiveSnapshot
  connection: ConnectionState
  frameAge: number
  error: string | null
  onRetry: () => void
}

const PUR = 'var(--pw-purple)', GRN = 'var(--pw-green)', YEL = 'var(--pw-yellow)'
const COMPOUND: Record<string, string> = { SOFT: '#ec3013', MEDIUM: 'oklch(0.85 0.16 90)', HARD: '#f0f2f5', INTERMEDIATE: 'oklch(0.62 0.15 150)', WET: '#4da3ff' }
const FLAG_COLOUR: Record<string, string> = {
  GREEN: GRN, YELLOW: YEL, 'DOUBLE YELLOW': YEL, SC: YEL, VSC: YEL, RED: '#ec3013', BLUE: '#4da3ff',
  CLEAR: 'var(--pw-bg)', CHEQUERED: 'repeating-conic-gradient(#05060a 0 25%,#f0f2f5 0 50%) 0 0/8px 8px',
  'BLACK AND WHITE': 'linear-gradient(135deg,#f0f2f5 50%,#05060a 50%)',
}
const FLAG_LABEL: Record<string, string> = { GREEN: 'GREEN FLAG', YELLOW: 'YELLOW FLAG', SC: 'SAFETY CAR', VSC: 'VIRTUAL SC', RED: 'RED FLAG' }

const colourOf = (c: string | null | undefined) => (c ? `#${c.replace('#', '')}` : '#8a94a6')
const clock = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}
const hms = (sec: number) => {
  sec = Math.max(0, Math.floor(sec))
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60
  return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`
}
const segColour = (code: number) => (code === 2051 ? PUR : code === 2049 ? GRN : code === 2048 ? YEL : code === 2064 ? '#4da3ff' : 'rgba(240,242,245,0.18)')

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

const EMPTY_DASH: Dash = {
  cars: [], car_history: {}, track: { outline: null, bounds: null }, race_control: [],
  weather: { air_temperature: null, track_temperature: null, humidity: null, pressure: null, rainfall: null, wind_speed: null, wind_direction: null, date: null, track_history: [] },
  stints: {}, pit_stops: [], pit_stops_total: 0, records: [], overtakes: [], lap_times: {}, laps_detail: {},
}

/**
 * The dashboard block is newer than some live servers in the field: a server
 * not yet redeployed still sends weather, session bests and stints in the
 * older analysis fields. Fill from those rather than show dashes for data
 * that is actually in the frame.
 */
function withFallbacks(snap: LiveSnapshot): Dash {
  const base = snap.dashboard && !snap.dashboard.error ? snap.dashboard : EMPTY_DASH
  const w = snap.analysis.weather
  const weather = base.weather.air_temperature == null && w?.ok
    ? { ...base.weather, air_temperature: w.air_temperature ?? null, track_temperature: w.track_temperature ?? null, rainfall: w.rainfall ?? null }
    : base.weather
  const markers = (snap.analysis.session_timeline?.markers ?? []).filter(m => m.type === 'SESSION_BEST' && m.time_s != null)
  const records = base.records.length ? base.records : markers.map((m, i) => ({
    driver_number: -i - 1, code: m.code ?? '?', lap_number: m.lap_number ?? 0, time_s: m.time_s as number, at: m.at,
    improvement_s: i ? +((markers[i - 1].time_s as number) - (m.time_s as number)).toFixed(3) : null,
  }))
  const stints = Object.keys(base.stints).length ? base.stints : Object.fromEntries(snap.tower
    .filter(r => r.compound && r.lap_number != null && r.stint_laps != null)
    .map(r => [String(r.driver_number), [{
      stint_number: r.stint_number ?? 1, compound: r.compound, lap_start: (r.lap_number as number) - (r.stint_laps as number) + 1,
      lap_end: null, tyre_age_at_start: r.tyre_age_at_start,
    }]]))
  return { ...base, weather, records, stints }
}

export function LiveDashboard({ snapshot, connection, frameAge, error, onRetry }: Props) {
  const now = useNow()
  const dash = useMemo(() => withFallbacks(snapshot), [snapshot])
  const profile = snapshot.profile ?? 'race'
  const isRace = profile === 'race'
  const practiceRows = snapshot.practice_tower ?? []
  const tower = snapshot.tower

  // Running order: pace for practice/qualifying, track position for a race.
  const order: { number: number; code: string; colour: string | null; team: string | null; position: number }[] = isRace
    ? tower.map(r => ({ number: r.driver_number, code: r.code, colour: r.colour, team: r.team, position: r.position }))
    : practiceRows.map(r => ({ number: r.driver_number, code: r.code, colour: r.colour, team: r.team, position: r.position }))

  const [selected, setSelected] = useState<number | null>(null)
  const sel = selected ?? order[0]?.number ?? dash.cars[0]?.driver_number ?? null

  const bands = useMemo(() => {
    const kindAt = (lap: number): NeutralBand['kind'] => {
      const m = dash.race_control.find(r => r.lap_number === lap && /SAFETY CAR|RED FLAG/i.test(r.message ?? ''))
      return m && /RED FLAG/i.test(m.message ?? '') ? 'RED' : m && /VIRTUAL/i.test(m.message ?? '') ? 'VSC' : 'SC'
    }
    return bandsFromLaps(snapshot.track_status.neutralised_laps ?? [], kindAt)
  }, [snapshot.track_status.neutralised_laps, dash.race_control])

  const chartDrivers = useMemo(() => driversFromLive({
    lapTimes: dash.lap_times,
    stints: dash.stints,
    pitLaps: Object.fromEntries(tower.map(r => [String(r.driver_number), r.pit_laps])),
    meta: order.map(o => ({ number: o.number, code: o.code, colour: o.colour, position: o.position })),
  }), [dash.lap_times, dash.stints, tower, order]) // eslint-disable-line react-hooks/exhaustive-deps

  const bad = connection !== 'open' || snapshot.feed.stale || !snapshot.feed.connected
  const [tab, setTabState] = useState<TabId>('timing')
  useEffect(() => {
    const h = window.location.hash.slice(1) as TabId
    if (TABS.some(t => t.id === h)) setTabState(h)
  }, [])
  const setTab = (t: TabId) => {
    setTabState(t)
    try { window.history.replaceState(null, '', `#${t}`) } catch { /* ignore */ }
  }

  return (
    <div className={`${s.root} ${archivo.className}`}>
      <StatusStrip snapshot={snapshot} bad={bad} connection={connection} frameAge={frameAge} error={error} onRetry={onRetry} />
      <Header snapshot={snapshot} now={now} profile={profile} />
      <KpiRow snapshot={snapshot} dash={dash} profile={profile} />
      <TabBar tab={tab} onTab={setTab} isRace={isRace} />

      {tab === 'timing' && <>
        <TimingTable snapshot={snapshot} dash={dash} isRace={isRace} selected={sel} onSelect={setSelected} />
        <section className={`${s.cells} ${s.section} ${s.three}`} style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
          <Records dash={dash} isRace={isRace} />
          <Weather dash={dash} trend={snapshot.analysis.weather?.track_temperature_trend ?? null} rainPeriods={snapshot.analysis.weather?.rain_periods ?? 0} />
        </section>
      </>}

      {tab === 'track' && (
        <section className={`${s.cells} ${s.section}`} style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(380px,1fr))' }}>
          <TrackMap dash={dash} order={order} selected={sel} onSelect={setSelected} />
          <CarData dash={dash} order={order} selected={sel} />
          <DriverPicker order={order} selected={sel} onSelect={setSelected} />
        </section>
      )}

      {tab === 'strategy' && <>
        <section className={`${s.cells} ${s.section}`} style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(380px,1fr))' }}>
          <CleanPace snapshot={snapshot} isRace={isRace} chartDrivers={chartDrivers} bands={bands} />
          {isRace ? <PitWatch snapshot={snapshot} isRace={isRace} /> : <LongRuns snapshot={snapshot} />}
          <PitLane dash={dash} />
        </section>
        <section className={`${s.cells} ${s.section} ${s.three}`} style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
          <TyreStrategy dash={dash} order={order} currentLap={snapshot.current_lap} />
          <Overtakes dash={dash} isRace={isRace} />
        </section>
      </>}

      {tab === 'predict' && <Predictions snapshot={snapshot} />}

      {tab === 'control' && (
        <section className={`${s.cells} ${s.section}`} style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(380px,1fr))' }}>
          <RaceControl dash={dash} />
          <TeamRadio snapshot={snapshot} />
          <EngineerNotes snapshot={snapshot} />
          <AfterFlag snapshot={snapshot} isRace={isRace} />
        </section>
      )}

      {tab === 'charts' && (
        <section className={s.section}>
          <div className={`${s.secHead} ${s.secHeadWide}`}>
            <h6 className={s.h6}>Lap by lap</h6>
            <span className={s.sub}>{isRace ? 'Lap times, gaps, tyre degradation and fuel — from completed laps only' : 'Every completed lap of the session'}</span>
          </div>
          {isRace
            ? <RaceLapCharts drivers={chartDrivers} bands={bands} totalLaps={snapshot.race_distance ?? Math.max(snapshot.current_lap, 1)} idPrefix="live" />
            : <LapTimeEvolutionChart drivers={chartDrivers} bands={bands} idPrefix="live" session="single-lap" />}
        </section>
      )}

      {tab === 'engineer' && (
        <section className={`${s.cells} ${s.section} ${s.three}`} style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
          <div className={s.span2} style={{ display: 'grid' }}>
            <LiveEngineer snapshot={snapshot} drivers={order.map(o => o.code)} selected={order.find(o => o.number === sel)?.code ?? null} />
          </div>
          <MiniOrder snapshot={snapshot} order={order} isRace={isRace} />
        </section>
      )}

      {tab === 'feed' && <FeedCoverage snapshot={snapshot} isRace={isRace} />}

      <footer className={s.footer}>
        Live data via OpenF1 over MQTT, relayed by this project&apos;s live server. Read-only: nothing on this page is a
        prediction. Team radio clips are linked from Formula 1&apos;s archive and are not stored here.
      </footer>
    </div>
  )
}

// ── tabs ────────────────────────────────────────────────────────────────────

type TabId = 'timing' | 'track' | 'strategy' | 'predict' | 'control' | 'charts' | 'engineer' | 'feed'
const TABS: { id: TabId; label: string }[] = [
  { id: 'timing', label: 'Timing' },
  { id: 'track', label: 'Track & car' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'predict', label: 'Predictions' },
  { id: 'control', label: 'Race control & radio' },
  { id: 'charts', label: 'Lap charts' },
  { id: 'engineer', label: 'Engineer AI' },
  { id: 'feed', label: 'Feed' },
]

function TabBar({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void; isRace: boolean }) {
  return (
    <nav className={s.tabs} aria-label="Live views">
      {TABS.map(t => (
        <button key={t.id} className={`${s.tab} ${tab === t.id ? s.tabOn : ''}`} onClick={() => onTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
          {t.label}{t.id === 'engineer' && <span className={s.tabNew}>AI</span>}
        </button>
      ))}
    </nav>
  )
}

function DriverPicker({ order, selected, onSelect }: { order: OrderRow[]; selected: number | null; onSelect: (n: number) => void }) {
  return (
    <div className={s.panel}>
      <div className={s.secHead}><h6 className={s.h6}>Follow a car</h6><span className={s.sub}>Map and telemetry follow your pick</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(92px,1fr))', gap: 2, background: 'var(--pw-divider)' }}>
        {order.map(o => (
          <button key={o.number} onClick={() => onSelect(o.number)} aria-pressed={o.number === selected}
            style={{ font: 'inherit', textAlign: 'left', border: 0, cursor: 'pointer', padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center',
              background: o.number === selected ? 'var(--pw-accent)' : 'var(--pw-bg)', color: o.number === selected ? '#fff' : 'var(--pw-text)' }}>
            <span style={{ width: 4, height: 22, background: colourOf(o.colour) }} />
            <span><b style={{ fontSize: 15 }}>{o.code}</b><br /><span style={{ fontSize: 11, opacity: 0.7 }}>P{o.position}</span></span>
          </button>
        ))}
        {!order.length && <div className={s.empty} style={{ background: 'var(--pw-bg)' }}>No drivers ranked yet.</div>}
      </div>
    </div>
  )
}

function MiniOrder({ snapshot, order, isRace }: { snapshot: LiveSnapshot; order: OrderRow[]; isRace: boolean }) {
  const practice = new Map((snapshot.practice_tower ?? []).map(r => [r.driver_number, r]))
  const race = new Map(snapshot.tower.map(r => [r.driver_number, r]))
  return (
    <div className={s.panel}>
      <div className={s.secHead}><h6 className={s.h6}>{isRace ? 'Running order' : 'Fastest laps'}</h6><span className={s.sub}>What the engineer sees</span></div>
      <div className={`${s.list} ${s.scroll}`} style={{ maxHeight: 640 }}>
        {order.map(o => {
          const r = race.get(o.number), p = practice.get(o.number)
          const val = isRace
            ? (o.position === 1 ? 'Leader' : r?.gap_to_leader == null ? '—' : typeof r.gap_to_leader === 'number' ? `+${r.gap_to_leader.toFixed(1)}` : r.gap_to_leader)
            : formatLap(p?.best_lap_s)
          return (
            <div key={o.number} style={{ display: 'grid', gridTemplateColumns: '32px 4px 1fr auto', gap: 10, alignItems: 'center', padding: '7px 20px', fontSize: 14 }}>
              <span className={s.sub}>{String(o.position).padStart(2, '0')}</span>
              <span style={{ height: 18, background: colourOf(o.colour) }} />
              <b>{o.code}</b>
              <span style={{ fontWeight: 600 }}>{val}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── strip & header ──────────────────────────────────────────────────────────

function StatusStrip({ snapshot, bad, connection, frameAge, error, onRetry }: {
  snapshot: LiveSnapshot; bad: boolean; connection: ConnectionState; frameAge: number; error: string | null; onRetry: () => void
}) {
  const f = snapshot.feed
  const streamLabel = connection === 'open' ? 'Stream connected' : connection === 'connecting' ? 'Connecting' : 'Connection lost — retrying'
  return (
    <div className={`${s.strip} ${bad ? s.stripBad : ''}`} role="status">
      <span className={s.stripItem}><span className={s.blinker} />{streamLabel}</span>
      <span>MQTT · {f.connected ? 'Connected' : 'Disconnected'} · {f.messages_total.toLocaleString('en-US')} messages</span>
      <span>Last feed message · {f.last_message_age_s == null ? '—' : `${f.last_message_age_s.toFixed(1)}s ago`}</span>
      {f.stale && <span>Feed stale · no timing for {f.stale_after_s}s+</span>}
      {connection !== 'open' && <span>Last frame {frameAge}s ago{error ? ` · ${error}` : ''}</span>}
      {connection !== 'open' && <button className={s.stripBtn} onClick={onRetry}>Retry</button>}
      <span className={s.stripRight}>Read-only · No predictions{f.mode === 'replay' ? ' · Capture replay' : ''}</span>
    </div>
  )
}

function Header({ snapshot, now, profile }: { snapshot: LiveSnapshot; now: number; profile: string }) {
  const info = snapshot.session_info ?? {}
  const start = info.date_start ? new Date(info.date_start).getTime() : null
  const end = info.date_end ? new Date(info.date_end).getTime() : null
  const city = snapshot.location ?? info.circuit_short_name ?? 'Live timing'
  const windowTxt = start && end
    ? `${clock(info.date_start).slice(0, 5)} – ${clock(info.date_end).slice(0, 5)} your time`
    : null
  const isRace = profile === 'race'
  const cells: [string, string][] = isRace
    ? [
        ['Race time', start && now > start ? hms((now - start) / 1000) : '—'],
        ['Lap', snapshot.current_lap ? `${snapshot.current_lap}${snapshot.race_distance ? ` / ${snapshot.race_distance}` : ''}` : '—'],
      ]
    : [
        [end && now < end ? 'Time remaining' : 'Session clock', end ? (now < end ? hms((end - now) / 1000) : 'Ended') : '—'],
        ['Drivers timed', String((snapshot.practice_tower ?? []).length)],
      ]
  return (
    <header className={s.header}>
      <div style={{ minWidth: 0 }}>
        <div className={s.kicker}><span className={s.square} />Live timing · OpenF1 · Session {snapshot.session_key ?? '—'}</div>
        <h1 className={s.h1}>{city}</h1>
        <div className={s.meta}>
          <b>{snapshot.session_name ?? snapshot.session_type ?? 'Live session'}</b>
          {info.circuit_short_name && <span>{info.circuit_short_name}</span>}
          {info.gmt_offset && <span>GMT{info.gmt_offset.startsWith('-') ? '' : '+'}{info.gmt_offset.slice(0, 5)} local</span>}
          {windowTxt && <span>{windowTxt}</span>}
          <span>Updated {clock(snapshot.generated_at)}</span>
        </div>
      </div>
      <div className={s.headRight}>
        <div className={s.seg} aria-label="Session type">
          {(['practice', 'qualifying', 'race'] as const).map(p => (
            <span key={p} className={`${s.segOpt} ${profile === p ? s.segOn : ''}`}>{p === 'qualifying' ? 'Qualifying' : p === 'practice' ? 'Practice' : 'Race'}</span>
          ))}
        </div>
        <div className={s.cells} style={{ gridTemplateColumns: 'repeat(2,minmax(130px,1fr))', border: '2px solid var(--pw-divider)' }}>
          {cells.map(([l, v]) => (
            <div key={l} className={`${s.cell} ${s.cellTight}`}><div className={s.label}>{l}</div><div className={s.mid}>{v}</div></div>
          ))}
        </div>
      </div>
    </header>
  )
}

function KpiRow({ snapshot, dash, profile }: { snapshot: LiveSnapshot; dash: Dash; profile: string }) {
  const w = dash.weather
  const isRace = profile === 'race'
  const p1 = snapshot.practice_tower?.[0]
  const rec = dash.records[dash.records.length - 1]
  const fast = !isRace && p1
    ? { t: p1.best_lap_s, sub: `${p1.code} · lap ${p1.best_lap_number} · ${p1.clean_laps} clean laps` }
    : rec ? { t: rec.time_s, sub: `${rec.code} · lap ${rec.lap_number}` } : null
  const flag = snapshot.session_status?.flag ?? snapshot.track_status.flag
  const hist = w.track_history
  let tempDelta: string | null = null
  if (hist.length >= 2) {
    const last = hist[hist.length - 1]
    const lastT = new Date(last[0]).getTime()
    const back = [...hist].reverse().find(h => lastT - new Date(h[0]).getTime() >= 9 * 60_000) ?? hist[0]
    const d = last[1] - back[1]
    const mins = Math.round((lastT - new Date(back[0]).getTime()) / 60_000)
    tempDelta = `${d > 0 ? 'Rising' : d < 0 ? 'Falling' : 'Steady'} · ${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}° in ${mins} min`
  }
  const wet = (w.rainfall ?? 0) > 0
  return (
    <section className={`${s.cells} ${s.ruled}`} style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
      <div className={s.cell}>
        <div className={s.label}>{isRace ? 'Fastest lap' : profile === 'qualifying' ? 'Provisional pole' : 'Session fastest'}</div>
        <div className={`${s.big} ${s.accent}`}>{fast ? formatLap(fast.t) : '—'}</div>
        <div className={s.sub}>{fast?.sub ?? 'No timed lap yet'}</div>
      </div>
      <div className={s.cell}>
        <div className={s.label}>Race control</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
          <span style={{ width: 20, height: 20, background: FLAG_COLOUR[flag] ?? GRN, border: '2px solid var(--pw-text)' }} />
          <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{FLAG_LABEL[flag] ?? flag}</span>
        </div>
        <div className={s.sub} style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{snapshot.track_status.source}</div>
      </div>
      <Kpi label="Track temperature" value={w.track_temperature == null ? '—' : `${w.track_temperature.toFixed(1)}°`} sub={tempDelta ?? 'Latest sample'} />
      <Kpi label="Air temperature" value={w.air_temperature == null ? '—' : `${w.air_temperature.toFixed(1)}°`} sub={w.humidity == null ? '—' : `Humidity ${Math.round(w.humidity)}%`} />
      <Kpi label="Wind" value={w.wind_speed == null ? '—' : <>{w.wind_speed.toFixed(1)}<span style={{ fontSize: 16, fontWeight: 600 }}> m/s</span></>}
        sub={w.wind_direction == null ? '—' : `From ${w.wind_direction}°${w.pressure == null ? '' : ` · ${w.pressure.toFixed(1)} mbar`}`} />
      <Kpi label="Track condition" value={w.rainfall == null ? '—' : wet ? 'WET' : 'DRY'} sub={`Rain periods confirmed: ${snapshot.analysis.weather?.rain_periods ?? 0}`} />
    </section>
  )
}

function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub: string }) {
  return <div className={s.cell}><div className={s.label}>{label}</div><div className={s.big}>{value}</div><div className={s.sub}>{sub}</div></div>
}

// ── timing ──────────────────────────────────────────────────────────────────

type Cell = { key: string; node: ReactNode }

function SectorCell({ time, colour, segs }: { time: number | null; colour: string | null; segs?: number[] | null }) {
  const bg = colour === 'purple' ? PUR : colour === 'green' ? GRN : 'transparent'
  return (
    <>
      <span className={s.chip} style={{ background: bg, color: bg === 'transparent' ? 'var(--pw-text)' : '#fff', fontWeight: colour === 'purple' ? 800 : 600, fontSize: 15 }}>
        {time == null ? '—' : time.toFixed(3)}
      </span>
      {segs && segs.length > 0 && <div className={s.dots}>{segs.slice(0, 12).map((c, i) => <span key={i} style={{ background: segColour(c) }} />)}</div>}
    </>
  )
}

function TimingTable({ snapshot, dash, isRace, selected, onSelect }: {
  snapshot: LiveSnapshot; dash: Dash; isRace: boolean; selected: number | null; onSelect: (n: number) => void
}) {
  const towerBy = new Map(snapshot.tower.map(r => [r.driver_number, r]))
  const minSector = (k: 'sector1' | 'sector2' | 'sector3') =>
    Math.min(...Object.values(dash.laps_detail).map(d => d.best_sectors[k] ?? Infinity))
  const sessionBest = { sector1: minSector('sector1'), sector2: minSector('sector2'), sector3: minSector('sector3') }

  const cols = isRace
    ? [['Pos', '52px'], ['Driver', 'minmax(190px,1.4fr)'], ['Interval', '92px'], ['Gap to leader', '112px'], ['Last', '100px'], ['Best lap', '108px'], ['S1', '96px'], ['S2', '96px'], ['S3', '96px'], ['Trap km/h', '92px'], ['Tyre', '128px'], ['Pit', '80px']]
    : [['Pos', '52px'], ['Driver', 'minmax(190px,1.4fr)'], ['Last', '100px'], ['Best lap', '108px'], ['Gap', '88px'], ['S1', '104px'], ['S2', '104px'], ['S3', '104px'], ['Ideal', '104px'], ['Trap km/h', '92px'], ['Tyre', '128px'], ['Status', '104px']]
  const grid = cols.map(c => c[1]).join(' ')

  const driverCell = (code: string, colour: string | null, sub: string): ReactNode => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className={s.teamBar} style={{ background: colourOf(colour) }} />
      <div><div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.1 }}>{code}</div><div className={s.sub} style={{ fontSize: 11 }}>{sub}</div></div>
    </div>
  )
  const tyreCell = (compound: string | null, age: number | null): ReactNode => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
      <span className={s.tyreSq} style={{ background: COMPOUND[(compound ?? '').toUpperCase()] ?? 'transparent' }} />
      {compound ?? '—'}{age != null ? ` · ${age}L` : ''}
    </div>
  )
  const plain = (t: ReactNode, sub?: ReactNode, strong = false) => (
    <><span style={{ fontSize: 15, fontWeight: strong ? 800 : 600 }}>{t}</span>{sub ? <div className={s.sub} style={{ fontSize: 11 }}>{sub}</div> : null}</>
  )
  const pos = (p: number) => <span style={{ fontSize: 17, fontWeight: 800, color: p === 1 ? 'var(--pw-accent-text)' : undefined }}>{String(p).padStart(2, '0')}</span>
  const gapTxt = (g: number | string | null) => (g == null ? '—' : typeof g === 'number' ? `+${g.toFixed(3)}` : g)

  let rows: { n: number; cells: Cell[] }[]
  if (isRace) {
    rows = snapshot.tower.map((r: TowerRow) => {
      const d = dash.laps_detail[String(r.driver_number)]
      const sec = (k: 'sector1' | 'sector2' | 'sector3') => {
        const t = d?.last[k] ?? null
        const c = t == null ? null : Math.abs(t - sessionBest[k]) < 0.0005 ? 'purple' : d && Math.abs(t - (d.best_sectors[k] ?? -1)) < 0.0005 ? 'green' : null
        return <SectorCell time={t} colour={c} />
      }
      return {
        n: r.driver_number,
        cells: [
          { key: 'pos', node: pos(r.position) },
          { key: 'drv', node: driverCell(r.code, r.colour, r.team ?? '') },
          { key: 'int', node: plain(r.position === 1 ? '—' : gapTxt(r.interval)) },
          { key: 'gap', node: plain(r.position === 1 ? 'Leader' : gapTxt(r.gap_to_leader), undefined, true) },
          { key: 'last', node: plain(formatLap(r.last_lap_s)) },
          { key: 'best', node: plain(formatLap(d?.best_s), d ? `L${d.best_lap}` : undefined, true) },
          { key: 's1', node: sec('sector1') }, { key: 's2', node: sec('sector2') }, { key: 's3', node: sec('sector3') },
          { key: 'trap', node: plain(d?.last.st_speed ?? '—', d ? `${d.last.i1_speed ?? '—'} · ${d.last.i2_speed ?? '—'}` : undefined) },
          { key: 'tyre', node: tyreCell(r.compound, r.tyre_age) },
          { key: 'pit', node: plain(`PIT ${r.stops}`, r.pit_laps.length ? `L${r.pit_laps.join(', L')}` : undefined) },
        ],
      }
    })
  } else {
    rows = (snapshot.practice_tower ?? []).map((r: PracticeTowerRow) => {
      const t = towerBy.get(r.driver_number)
      const d = dash.laps_detail[String(r.driver_number)]
      const inPit = t && t.lap_number != null && t.pit_laps.includes(t.lap_number)
      const status = inPit ? 'IN PIT' : t?.is_pit_out_lap ? 'OUT LAP' : 'ON TRACK'
      const ideal = r.ideal_lap?.total ?? null
      const dI = ideal == null ? 0 : r.best_lap_s - ideal
      return {
        n: r.driver_number,
        cells: [
          { key: 'pos', node: pos(r.position) },
          { key: 'drv', node: driverCell(r.code, r.colour, `L${r.best_lap_number} · ${r.laps} laps · ${r.clean_laps} clean`) },
          { key: 'last', node: plain(formatLap(d?.last_s ?? t?.last_lap_s)) },
          { key: 'best', node: plain(formatLap(r.best_lap_s), undefined, true) },
          { key: 'gap', node: plain(r.position === 1 || r.gap_to_p1 == null ? '—' : `+${r.gap_to_p1.toFixed(3)}`) },
          { key: 's1', node: <SectorCell time={r.sectors.sector1.time} colour={r.sectors.sector1.colour} segs={r.segments?.seg1} /> },
          { key: 's2', node: <SectorCell time={r.sectors.sector2.time} colour={r.sectors.sector2.colour} segs={r.segments?.seg2} /> },
          { key: 's3', node: <SectorCell time={r.sectors.sector3.time} colour={r.sectors.sector3.colour} segs={r.segments?.seg3} /> },
          { key: 'ideal', node: plain(formatLap(ideal), dI > 0.0005 ? `+${dI.toFixed(3)}` : undefined) },
          { key: 'trap', node: plain(r.speed_traps?.st_speed ?? '—', `${r.speed_traps?.i1_speed ?? '—'} · ${r.speed_traps?.i2_speed ?? '—'}`) },
          { key: 'tyre', node: tyreCell(r.compound, r.tyre_age) },
          { key: 'st', node: <span className={s.chip} style={{ fontSize: 12, fontWeight: 800, background: status === 'IN PIT' ? 'var(--pw-text)' : 'transparent', color: status === 'IN PIT' ? 'var(--pw-bg)' : status === 'OUT LAP' ? 'var(--pw-muted)' : 'var(--pw-text)' }}>{status}</span> },
        ],
      }
    })
  }

  return (
    <section className={s.section}>
      <div className={`${s.secHead} ${s.secHeadWide}`}>
        <h6 className={s.h6}>Live timing</h6>
        <span className={s.sub}>{isRace ? 'Ranked by race position · intervals update about every 4 s' : 'Ranked by fastest completed lap · purple session best, green personal best'}</span>
        <span className={s.secAside}>{rows.length} timed drivers</span>
      </div>
      <div className={s.timingScroll}>
        <div style={{ minWidth: 1180 }}>
          <div className={s.tHead} style={{ gridTemplateColumns: grid }}>{cols.map(c => <div key={c[0]} className={s.th}>{c[0]}</div>)}</div>
          {rows.map(r => {
            const on = r.n === selected
            return (
              <div key={r.n} role="button" tabIndex={0} aria-pressed={on} className={s.tRow}
                onClick={() => onSelect(r.n)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.n) } }}
                style={{ gridTemplateColumns: grid, background: on ? 'var(--pw-accent-tint)' : undefined, boxShadow: `inset 5px 0 0 ${on ? 'var(--pw-accent)' : 'transparent'}` }}>
                {r.cells.map(c => <div key={c.key} className={s.td}>{c.node}</div>)}
              </div>
            )
          })}
          {!rows.length && <div className={s.empty}>Waiting for the first timed lap. The tower fills in as OpenF1 publishes completed laps.</div>}
        </div>
      </div>
    </section>
  )
}

// ── map, car, race control ──────────────────────────────────────────────────

type OrderRow = { number: number; code: string; colour: string | null; team: string | null; position: number }

function TrackMap({ dash, order, selected, onSelect }: { dash: Dash; order: OrderRow[]; selected: number | null; onSelect: (n: number) => void }) {
  const { outline, bounds } = dash.track
  const W = 400, H = 300, P = 22
  const proj = useMemo(() => {
    if (!bounds) return null
    const [x0, y0, x1, y1] = bounds
    const sc = Math.min((W - 2 * P) / (x1 - x0 || 1), (H - 2 * P) / (y1 - y0 || 1))
    const ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2
    // y up in the feed, down on screen
    return (x: number, y: number): [number, number] => [ox + (x - x0) * sc, H - (oy + (y - y0) * sc)]
  }, [bounds])
  const posOf = new Map(order.map(o => [o.number, o.position]))
  const d = proj && outline ? `M${outline.map(([x, y]) => proj(x, y).map(v => v.toFixed(1)).join(',')).join(' L')} Z` : null
  const sf = proj && outline?.length ? proj(outline[0][0], outline[0][1]) : null
  const cars = dash.cars.filter(c => c.x != null && c.y != null)
  return (
    <div className={s.panel}>
      <div className={s.secHead}><h6 className={s.h6}>Track map</h6><span className={s.sub}>Location · ~3.7 Hz</span><span className={s.secAside}>{cars.length} cars</span></div>
      <div style={{ padding: '16px 20px 20px' }}>
        <div className={s.map}>
          {d && (
            <svg viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
              <path d={d} fill="none" stroke="rgba(240,242,245,0.16)" strokeWidth="12" strokeLinejoin="round" />
              <path d={d} fill="none" stroke="rgba(240,242,245,0.75)" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          )}
          {sf && <div style={{ position: 'absolute', left: `${sf[0] / W * 100}%`, top: `${sf[1] / H * 100}%`, transform: 'translate(-50%,-50%)', fontSize: 10, fontWeight: 800, background: 'var(--pw-text)', color: 'var(--pw-bg)', padding: '1px 5px', letterSpacing: '0.06em' }}>S/F</div>}
          {proj && cars.map(c => {
            const [px, py] = proj(c.x as number, c.y as number)
            const p = posOf.get(c.driver_number) ?? 99
            const on = c.driver_number === selected
            const size = on ? 18 : p <= 3 ? 12 : 10
            return (
              <button key={c.driver_number} className={s.car} onClick={() => onSelect(c.driver_number)} aria-label={`${c.code}, P${p}`}
                style={{ left: `${px / W * 100}%`, top: `${py / H * 100}%`, width: size, height: size, background: colourOf(c.colour), zIndex: on ? 30 : 30 - Math.min(p, 29) }}>
                {(on || p <= 3) && <span className={s.carTag}>{c.code}</span>}
              </button>
            )
          })}
          {!cars.length && <div className={s.empty} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>No car positions yet — they arrive once cars are on track.</div>}
        </div>
        <div className={s.foot} style={{ padding: '10px 0 0' }}>
          {outline ? 'The circuit is drawn from the first clean lap completed in this session.' : 'The circuit outline appears after the first clean flying lap; until then only the cars are drawn.'} Positions refresh every 2 s; lateral track position is approximate.
        </div>
      </div>
    </div>
  )
}

function CarData({ dash, order, selected }: { dash: Dash; order: OrderRow[]; selected: number | null }) {
  const car = dash.cars.find(c => c.driver_number === selected)
  const row = order.find(o => o.number === selected)
  const hist = (selected != null ? dash.car_history[String(selected)] : null) ?? []
  const det = selected != null ? dash.laps_detail[String(selected)] : undefined
  const pts = (f: (h: [number | null, number | null, number | null]) => number) =>
    hist.map((h, i) => `${(i / Math.max(1, hist.length - 1) * 300).toFixed(1)},${f(h).toFixed(1)}`).join(' ')
  const drs = car?.drs ?? null
  const drsLabel = drs == null ? '—' : drs >= 10 ? 'OPEN' : drs === 8 ? 'ELIGIBLE' : 'CLOSED'
  return (
    <div className={s.panel}>
      <div className={s.secHead}>
        <h6 className={s.h6}>Car data</h6><span className={s.sub}>Telemetry · ~3.7 Hz</span>
        <span className={s.secAside} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: 'var(--pw-text)' }}>
          <span className={s.tyreSq} style={{ background: colourOf(row?.colour ?? car?.colour) }} />{row?.code ?? car?.code ?? '—'}{row ? ` · P${row.position}` : ''}
        </span>
      </div>
      {!car ? <div className={s.empty}>No telemetry for this car yet. Select a driver in the timing table; car data arrives while cars are running.</div> : (
        <>
          <div className={s.cells} style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
            <div className={s.cell} style={{ padding: '14px 20px' }}><div className={s.label}>Speed km/h</div><div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }}>{car.speed ?? '—'}</div></div>
            <div className={s.cell} style={{ padding: '14px 20px' }}><div className={s.label}>Gear</div><div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1 }}>{car.gear ?? '—'}</div></div>
            <div className={s.cell} style={{ padding: '14px 20px' }}><div className={s.label}>RPM</div><div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.5 }}>{car.rpm?.toLocaleString('en-US') ?? '—'}</div>
              <div style={{ height: 6, background: 'var(--pw-surface)' }}><div style={{ height: '100%', width: `${Math.min(100, (car.rpm ?? 0) / 130)}%`, background: 'var(--pw-text)' }} /></div></div>
          </div>
          <div style={{ padding: '16px 20px', display: 'grid', gap: 12, borderBottom: '2px solid var(--pw-divider)' }}>
            <div className={s.barRow}><span>Throttle</span><div className={s.bar}><div style={{ width: `${car.throttle ?? 0}%`, background: 'var(--pw-text)' }} /></div><b style={{ fontSize: 14 }}>{car.throttle ?? '—'}%</b></div>
            <div className={s.barRow}><span>Brake</span><div className={s.bar}><div style={{ width: `${car.brake ?? 0}%`, background: 'var(--pw-accent)' }} /></div><b style={{ fontSize: 14 }}>{car.brake ?? '—'}%</b></div>
            <div className={s.barRow} style={{ gridTemplateColumns: '84px 1fr' }}><span>DRS flag</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, padding: '2px 8px', border: '2px solid var(--pw-text)', background: drsLabel === 'OPEN' ? 'var(--pw-accent)' : 'transparent' }}>{drsLabel}</span>
                <span className={s.sub}>raw {drs ?? '—'}</span>
              </div>
            </div>
          </div>
          <div style={{ padding: '14px 20px 8px' }}>
            <svg viewBox="0 0 300 90" preserveAspectRatio="none" style={{ width: '100%', height: 96, display: 'block', background: 'var(--pw-surface)' }} aria-hidden>
              <polyline points={pts(h => (h[2] ?? 0) > 0 ? 6 : 88)} fill="none" stroke="rgba(240,242,245,0.35)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <polyline points={pts(h => 88 - (h[1] ?? 0) / 100 * 84)} fill="none" stroke="#ec3013" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <polyline points={pts(h => 88 - (h[0] ?? 0) / 360 * 84)} fill="none" stroke="#f0f2f5" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, marginTop: 6, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
              <span>▬ Speed</span><span style={{ color: 'var(--pw-accent-text)' }}>▬ Throttle</span><span className={s.sub}>▬ Brake</span>
              <span className={s.sub} style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>Last {Math.round(hist.length / 3.7)} s</span>
            </div>
          </div>
          <div className={s.cells} style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', borderTop: '2px solid var(--pw-divider)' }}>
            {([['I1 speed', det?.last.i1_speed], ['I2 speed', det?.last.i2_speed], ['Speed trap', det?.last.st_speed]] as const).map(([l, v]) => (
              <div key={l} className={s.cell} style={{ padding: '10px 20px' }}><div className={s.label}>{l}</div><div style={{ fontSize: 18, fontWeight: 800 }}>{v ?? '—'}</div></div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function RaceControl({ dash }: { dash: Dash }) {
  const [filter, setFilter] = useState<'all' | 'flags' | 'cars'>('all')
  const rows = dash.race_control.filter(r => filter === 'all'
    || (filter === 'flags' ? r.category === 'Flag' || r.category === 'SafetyCar' : r.category === 'CarEvent' || r.category === 'Drs'))
  return (
    <div className={s.panel}>
      <div className={s.secHead}><h6 className={s.h6}>Race control</h6><span className={s.sub}>Flags, incidents, safety car</span></div>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--pw-divider)' }}>
        <div className={s.seg}>
          {([['all', 'All'], ['flags', 'Flags'], ['cars', 'Car events']] as const).map(([k, l]) => (
            <button key={k} className={`${s.segOpt} ${s.segBtn} ${filter === k ? s.segOn : ''}`} style={{ padding: '5px 12px' }} onClick={() => setFilter(k)} aria-pressed={filter === k}>{l}</button>
          ))}
        </div>
      </div>
      <div className={`${s.scroll} ${s.list}`}>
        {rows.map((r, i) => (
          <div key={`${r.date}-${i}`} style={{ display: 'grid', gridTemplateColumns: '64px 14px 1fr', gap: 12, padding: '12px 20px' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{clock(r.date)}</span>
            <span className={s.flagSq} style={{ background: FLAG_COLOUR[(r.flag ?? '').toUpperCase()] ?? 'rgba(240,242,245,0.3)' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{r.message}</div>
              <div className={s.label} style={{ marginTop: 3 }}>
                {r.category ?? '—'}{r.scope ? ` · ${r.scope}` : ''}{r.sector != null ? ` ${r.sector}` : ''}{r.lap_number ? ` · L${r.lap_number}` : ''}
              </div>
            </div>
          </div>
        ))}
        {!rows.length && <div className={s.empty}>No race-control messages{filter !== 'all' ? ' of this kind' : ''} yet.</div>}
      </div>
    </div>
  )
}

// ── records & weather ───────────────────────────────────────────────────────

function Records({ dash, isRace }: { dash: Dash; isRace: boolean }) {
  const recs = dash.records
  const times = recs.map(r => r.time_s)
  const max = Math.max(...times), min = Math.min(...times)
  return (
    <div className={`${s.panel} ${s.span2}`}>
      <div className={s.secHead}>
        <h6 className={s.h6}>{isRace ? 'Fastest lap progression' : 'Session pace evolution'}</h6>
        <span className={s.sub}>New session records, in order</span>
        <span className={s.secAside}>{recs.length} improvements</span>
      </div>
      {recs.length ? (
        <div className={s.cells} style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(88px,1fr))', margin: 20, borderBottom: '2px solid var(--pw-text)' }}>
          {recs.map((r, i) => {
            const last = i === recs.length - 1
            return (
              <div key={`${r.driver_number}-${r.lap_number}`} style={{ background: 'var(--pw-bg)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 230, minWidth: 0 }}>
                <div style={{ padding: '0 10px 8px' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: last ? 'var(--pw-accent-text)' : undefined }}>{formatLap(r.time_s)}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{r.code} · L{r.lap_number}</div>
                  <div className={s.sub} style={{ fontSize: 11 }}>{r.improvement_s == null ? 'First record' : `−${r.improvement_s.toFixed(3)}`}</div>
                </div>
                <div style={{ height: `${14 + ((r.time_s - min) / (max - min || 1)) * 52}%`, background: last ? 'var(--pw-accent)' : 'rgba(240,242,245,0.22)' }} />
              </div>
            )
          })}
        </div>
      ) : <div className={s.empty}>No timed lap yet. Each new session record is added here as it is set.</div>}
    </div>
  )
}

function Weather({ dash, trend, rainPeriods }: { dash: Dash; trend: string | null; rainPeriods: number }) {
  const w = dash.weather
  const h = w.track_history.map(x => x[1])
  const lo = Math.min(...h), hi = Math.max(...h)
  const spark = h.map((v, i) => `${(i / Math.max(1, h.length - 1) * 120).toFixed(1)},${(30 - ((v - lo) / (hi - lo || 1)) * 28).toFixed(1)}`).join(' ')
  const cell = (label: string, value: ReactNode) => (
    <div className={s.cell} style={{ padding: '12px 20px' }}><div className={s.label}>{label}</div><div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div></div>
  )
  const unit = (u: string) => <span style={{ fontSize: 13, fontWeight: 600 }}> {u}</span>
  return (
    <div className={s.panel}>
      <div className={s.secHead}><h6 className={s.h6}>Weather</h6><span className={s.sub}>Updated about every minute{w.date ? ` · ${clock(w.date)}` : ''}</span></div>
      <div className={s.cells} style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
        {cell('Air', w.air_temperature == null ? '—' : <>{w.air_temperature.toFixed(1)}{unit('°C')}</>)}
        {cell('Track', w.track_temperature == null ? '—' : <>{w.track_temperature.toFixed(1)}{unit('°C')}</>)}
        {cell('Humidity', w.humidity == null ? '—' : <>{Math.round(w.humidity)}{unit('%')}</>)}
        {cell('Pressure', w.pressure == null ? '—' : <>{w.pressure.toFixed(1)}{unit('mbar')}</>)}
        {cell('Wind speed', w.wind_speed == null ? '—' : <>{w.wind_speed.toFixed(1)}{unit('m/s')}</>)}
        <div className={s.cell} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, border: '2px solid var(--pw-text)', position: 'relative', flex: 'none' }} aria-hidden>
            {w.wind_direction != null && (
              // the feed gives where the wind comes from; the arrow points where it blows
              <div style={{ position: 'absolute', inset: 0, transform: `rotate(${(w.wind_direction + 180) % 360}deg)` }}>
                <div style={{ position: 'absolute', left: '50%', top: 3, bottom: 3, width: 2, marginLeft: -1, background: 'var(--pw-text)' }} />
                <div style={{ position: 'absolute', left: '50%', top: 2, marginLeft: -5, border: '5px solid transparent', borderBottom: '8px solid var(--pw-accent)', borderTop: 0 }} />
              </div>
            )}
          </div>
          <div><div className={s.label}>Direction</div><div style={{ fontSize: 24, fontWeight: 800 }}>{w.wind_direction == null ? '—' : `${w.wind_direction}°`}</div></div>
        </div>
        <div className={s.cell} style={{ padding: '12px 20px', gridColumn: 'span 2' }}>
          <div className={s.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Track temperature · last {h.length} samples{trend ? ` · ${trend}` : ''}</span>
            <span>Rainfall: {(w.rainfall ?? 0) > 0 ? 'yes' : 'none'} · {rainPeriods} period{rainPeriods === 1 ? '' : 's'}</span>
          </div>
          {h.length > 1
            ? <svg viewBox="0 0 120 32" preserveAspectRatio="none" style={{ width: '100%', height: 44, display: 'block', marginTop: 6 }} aria-hidden><polyline points={spark} fill="none" stroke="#f0f2f5" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>
            : <div className={s.sub} style={{ marginTop: 6 }}>Needs two weather samples.</div>}
        </div>
      </div>
    </div>
  )
}

// ── pace, runs, pit lane ────────────────────────────────────────────────────

const CONF_DOTS = { Low: 1, Medium: 2, High: 3 } as const

function ConfDots({ c }: { c: 'Low' | 'Medium' | 'High' }) {
  return (
    <span style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3].map(i => <span key={i} style={{ width: 8, height: 8, background: i <= CONF_DOTS[c] ? 'var(--pw-text)' : 'rgba(240,242,245,0.2)' }} />)}
    </span>
  )
}

function CleanPace({ snapshot, isRace, chartDrivers, bands }: { snapshot: LiveSnapshot; isRace: boolean; chartDrivers: ReturnType<typeof driversFromLive>; bands: NeutralBand[] }) {
  let rows: { code: string; n: number; best: number; rep: number; conf: 'Low' | 'Medium' | 'High' }[]
  if (!isRace) {
    rows = (snapshot.pace ?? []).map(p => ({ code: p.code, n: p.sample_size, best: p.fastest_clean_lap_s, rep: p.median_clean_lap_s, conf: p.confidence }))
  } else {
    // A race has no pace service live; the same exclusions the charts use.
    const neutral = new Set(bands.flatMap(b => Array.from({ length: b.to - b.from + 1 }, (_, i) => b.from + i)))
    rows = chartDrivers.map(d => {
      const laps = d.laps.filter(l => l.lap > 1 && !l.pitIn && !l.pitOut && !neutral.has(l.lap)).map(l => l.time)
      const m = median(laps)
      const clean = m == null ? [] : laps.filter(t => t <= m * 1.07)
      const rep = median(clean)
      return rep == null ? null : { code: d.code, n: clean.length, best: Math.min(...clean), rep, conf: (clean.length >= 10 ? 'High' : clean.length >= 5 ? 'Medium' : 'Low') as 'Low' | 'Medium' | 'High' }
    }).filter((r): r is NonNullable<typeof r> => r != null).sort((a, b) => a.rep - b.rep)
  }
  return (
    <div className={s.panel}>
      <div className={s.secHead}><h6 className={s.h6}>Clean lap pace</h6><span className={s.sub}>Median representative lap</span><span className={s.secAside}>{rows.length} drivers</span></div>
      <div className={s.list}>
        {rows.slice(0, 10).map((p, i) => (
          <div key={p.code} style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 12, alignItems: 'center', padding: '10px 20px' }}>
            <span className={s.sub} style={{ fontSize: 15, fontWeight: 600 }}>{String(i + 1).padStart(2, '0')}</span>
            <div><div style={{ fontSize: 16, fontWeight: 800 }}>{p.code} <span className={s.sub} style={{ fontSize: 11, fontWeight: 400 }}>n={p.n}</span></div><div className={s.sub} style={{ fontSize: 11 }}>Best clean lap {formatLap(p.best)}</div></div>
            <div style={{ minWidth: 110 }}><div style={{ fontSize: 17, fontWeight: 800 }}>{formatLap(p.rep)}</div><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}><ConfDots c={p.conf} />{p.conf} confidence</div></div>
          </div>
        ))}
        {!rows.length && <div className={s.empty}>Needs representative completed laps before a comparison means anything.</div>}
      </div>
      <div className={s.foot}>Pit, first and neutralised laps are removed. Confidence follows the clean-lap sample size.</div>
    </div>
  )
}

function LongRuns({ snapshot }: { snapshot: LiveSnapshot }) {
  const runs = snapshot.long_runs ?? []
  const maxLaps = Math.max(10, ...runs.map(r => r.laps))
  return (
    <div className={s.panel}>
      <div className={s.secHead}><h6 className={s.h6}>Long-run pace</h6><span className={s.sub}>Consecutive clean stint</span><span className={s.secAside}>{runs.length} runs</span></div>
      <div className={s.list}>
        {runs.slice(0, 8).map(g => (
          <div key={`${g.driver_number}-${g.lap_start}`} style={{ padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className={s.tyreSq} style={{ background: COMPOUND[(g.compound ?? '').toUpperCase()] ?? 'transparent', alignSelf: 'center' }} />
              <span style={{ fontSize: 16, fontWeight: 800 }}>{g.code}</span><span style={{ fontSize: 11, letterSpacing: '0.06em' }}>{g.compound ?? '—'}</span>
              <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800 }}>{formatLap(g.median_s)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <div style={{ flex: 1, height: 6, background: 'var(--pw-surface)' }}><div style={{ height: '100%', width: `${g.laps / maxLaps * 100}%`, background: 'var(--pw-text)' }} /></div>
              <span className={s.sub} style={{ fontSize: 11 }}>L{g.lap_start}–{g.lap_end} · {g.laps} clean laps</span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{g.confidence}</span>
            </div>
          </div>
        ))}
        {!runs.length && <div className={s.empty}>Only sustained runs of clean laps are shown; short runs are not called race simulations.</div>}
      </div>
      <div className={s.foot}>Median lap time over the displayed run.</div>
    </div>
  )
}

function EngineerNotes({ snapshot }: { snapshot: LiveSnapshot }) {
  return (
    <div className={s.panel}>
      <div className={s.secHead}><h6 className={s.h6}>Engineer notes</h6><span className={s.sub}>What the data says so far</span><span className={s.secAside}>{snapshot.notes.length}</span></div>
      <div className={`${s.list} ${s.scroll}`}>
        {snapshot.notes.slice(0, 10).map(n => (
          <div key={n.id} style={{ display: 'grid', gridTemplateColumns: '6px 1fr', gap: 12, padding: '12px 20px' }}>
            <span style={{ background: n.severity === 'High' ? 'var(--pw-accent)' : n.severity === 'Medium' ? YEL : 'rgba(240,242,245,0.25)' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{n.title}{n.lap_number ? <span className={s.sub} style={{ fontWeight: 400 }}> · L{n.lap_number}</span> : null}</div>
              <div className={s.sub} style={{ fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>{n.message}</div>
            </div>
          </div>
        ))}
        {!snapshot.notes.length && <div className={s.empty}>Nothing notable yet.</div>}
      </div>
    </div>
  )
}

function PitLane({ dash }: { dash: Dash }) {
  const stops = dash.pit_stops.map(p => p.stop_duration).filter((v): v is number => v != null)
  const best = stops.length ? Math.min(...stops) : null
  const grid = '48px 1fr 88px 88px'
  return (
    <div className={s.panel}>
      <div className={s.secHead}><h6 className={s.h6}>Pit lane</h6><span className={s.sub}>Lane and stationary time</span><span className={s.secAside}>{dash.pit_stops_total} stops</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, padding: '8px 20px', background: 'var(--pw-surface)' }} className={s.label}><span>Lap</span><span>Driver</span><span>Lane</span><span>Stop</span></div>
      <div className={s.list}>
        {dash.pit_stops.map((q, i) => {
          const lane = q.lane_duration ?? q.pit_duration
          return (
            <div key={`${q.driver_number}-${q.lap_number}-${i}`} style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, padding: '9px 20px', fontSize: 14, alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>L{q.lap_number ?? '—'}</span><span style={{ fontWeight: 800 }}>{q.code}</span>
              <span>{lane == null ? '—' : `${lane.toFixed(1)} s`}</span>
              <span style={{ fontWeight: 800, color: q.stop_duration != null && q.stop_duration === best ? 'var(--pw-accent-text)' : undefined }}>{q.stop_duration == null ? '—' : `${q.stop_duration.toFixed(1)} s`}</span>
            </div>
          )
        })}
        {!dash.pit_stops.length && <div className={s.empty}>No pit stops recorded yet.</div>}
      </div>
    </div>
  )
}

// ── strategy & radio ────────────────────────────────────────────────────────

function TyreStrategy({ dash, order, currentLap }: { dash: Dash; order: OrderRow[]; currentLap: number }) {
  const [all, setAll] = useState(false)
  const lastLap = (n: number) => {
    const laps = dash.lap_times[String(n)] ?? []
    return laps.length ? laps[laps.length - 1][0] + 1 : currentLap
  }
  const rows = order.slice(0, all ? order.length : 10)
  const max = Math.max(currentLap, 1, ...Object.values(dash.stints).flat().map(st => st.lap_end ?? 0), ...rows.map(r => lastLap(r.number)))
  return (
    <div className={`${s.panel} ${s.span2}`}>
      <div className={s.secHead} style={{ alignItems: 'center', padding: '12px 20px' }}>
        <h6 className={s.h6}>Tyre strategy</h6><span className={s.sub}>Stints by lap</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center', fontSize: 11, fontWeight: 600, flexWrap: 'wrap' }}>
          {(['SOFT', 'MEDIUM', 'HARD'] as const).map(c => <span key={c} style={{ display: 'flex', gap: 5, alignItems: 'center' }}><span className={s.tyreSq} style={{ width: 10, height: 10, background: COMPOUND[c] }} />{c[0] + c.slice(1).toLowerCase()}</span>)}
          {order.length > 10 && <button className={s.btn} onClick={() => setAll(a => !a)}>{all ? 'Top 10' : `All ${order.length}`}</button>}
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {rows.map(r => {
          const stints = dash.stints[String(r.number)] ?? []
          return (
            <div key={r.number} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 10, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 16, background: colourOf(r.colour), border: '1px solid var(--pw-text)' }} />{r.code}</span>
              <div style={{ position: 'relative', background: 'var(--pw-surface)', height: 22 }}>
                {stints.map(st => {
                  const from = st.lap_start ?? 1
                  const to = st.lap_end ?? lastLap(r.number)
                  const c = (st.compound ?? '?').toUpperCase()
                  const light = c === 'HARD' || c === 'MEDIUM'
                  return (
                    <div key={st.stint_number} title={`${c} · laps ${from}–${to}${st.tyre_age_at_start ? ` · ${st.tyre_age_at_start} laps old at fitting` : ''}`}
                      style={{ position: 'absolute', top: 0, bottom: 0, left: `${(from - 1) / max * 100}%`, width: `${Math.max(1, to - from + 1) / max * 100}%`,
                        background: COMPOUND[c] ?? 'rgba(240,242,245,0.3)', border: '2px solid var(--pw-bg)', fontSize: 10, fontWeight: 800,
                        color: light ? '#05060a' : '#fff', display: 'flex', alignItems: 'center', paddingLeft: 5, whiteSpace: 'nowrap', overflow: 'hidden', boxSizing: 'border-box' }}>
                      {c[0]} {to - from + 1}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {!rows.length && <div className={s.empty} style={{ padding: 0 }}>No stints published yet.</div>}
        <div className={s.sub} style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0 0 62px', fontSize: 11 }}><span>Lap 1</span><span>Lap {max}</span></div>
      </div>
    </div>
  )
}

function TeamRadio({ snapshot }: { snapshot: LiveSnapshot }) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  useEffect(() => () => { audio.current?.pause() }, [])
  const toggle = (url: string) => {
    if (!audio.current) {
      audio.current = new Audio()
      audio.current.onended = () => setPlaying(null)
    }
    if (playing === url) {
      audio.current.pause()
      setPlaying(null)
      return
    }
    audio.current.src = url
    audio.current.play().then(() => setPlaying(url)).catch(() => setPlaying(null))
  }
  const clips = snapshot.radio.slice(0, 6)
  return (
    <div className={s.panel}>
      <div className={s.secHead}><h6 className={s.h6}>Team radio</h6><span className={s.sub}>Latest clips</span></div>
      <div className={s.list}>
        {clips.map((c, i) => {
          const on = !!c.recording_url && playing === c.recording_url
          return (
            <div key={`${c.date}-${i}`} style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 14, alignItems: 'center', padding: '10px 20px' }}>
              <button className={`${s.playBtn} ${on ? s.playOn : ''}`} disabled={!c.recording_url} onClick={() => c.recording_url && toggle(c.recording_url)} aria-label={on ? 'Pause radio clip' : 'Play radio clip'}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={on ? 'M6 4h4v16H6zM14 4h4v16h-4z' : 'M6 3l14 9-14 9z'} /></svg>
              </button>
              <div><div style={{ fontSize: 15, fontWeight: 800 }}>{c.code}</div><div className={s.sub} style={{ fontSize: 11 }}>{clock(c.date)}{c.lap_number ? ` · L${c.lap_number}` : ''}</div></div>
              {c.recording_url && <a href={c.recording_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: 'var(--pw-accent-text)' }}>Open clip ↗</a>}
            </div>
          )
        })}
        {!clips.length && <div className={s.empty}>No team radio published yet this session.</div>}
      </div>
      <div className={s.foot}>Clips are linked from the Formula 1 archive and not stored here. Only a selection is published.</div>
    </div>
  )
}

// ── race-only panels ────────────────────────────────────────────────────────

function Lock({ children }: { children: ReactNode }) {
  return (
    <div className={s.lock}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: 'none' }} aria-hidden><rect x="3" y="11" width="18" height="11" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
      <div>{children}</div>
    </div>
  )
}

function Overtakes({ dash, isRace }: { dash: Dash; isRace: boolean }) {
  return (
    <div className={s.panel}>
      <div className={s.secHead}><h6 className={s.h6}>Overtakes</h6><span className={s.sub}>Position exchanges</span></div>
      {!isRace ? <Lock><b>Race sessions only.</b> OpenF1 publishes overtakes for races.</Lock> : (
        <div className={s.list}>
          {dash.overtakes.map((o, i) => (
            <div key={`${o.date}-${i}`} style={{ display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: 10, padding: '11px 20px', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{o.lap_number ? `L${o.lap_number}` : clock(o.date).slice(0, 5)}</span>
              <span style={{ fontSize: 15 }}><b>{o.overtaking_code ?? '?'}</b> passed <b>{o.overtaken_code ?? '?'}</b></span>
              {o.position != null && <span style={{ fontSize: 15, fontWeight: 800, background: 'var(--pw-text)', color: 'var(--pw-bg)', padding: '1px 8px' }}>P{o.position}</span>}
            </div>
          ))}
          {!dash.overtakes.length && <div className={s.empty}>No overtakes published yet.</div>}
        </div>
      )}
    </div>
  )
}

function PitWatch({ snapshot, isRace }: { snapshot: LiveSnapshot; isRace: boolean }) {
  return (
    <div className={s.panel}>
      <div className={s.secHead}><h6 className={s.h6}>Pit window watch</h6><span className={s.sub}>Measurements, not predictions</span></div>
      {!isRace ? <Lock><b>Race sessions only.</b> Stint length and pace-loss signals need a race distance.</Lock> : (
        <div className={s.list}>
          {snapshot.pit_watch.slice(0, 8).map((w, i) => (
            <div key={`${w.driver_number}-${w.kind}-${i}`} style={{ padding: '12px 20px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}><b style={{ fontSize: 15 }}>{w.driver_code}</b><span style={{ fontSize: 13, fontWeight: 600 }}>{w.headline}</span><span className={s.sub} style={{ marginLeft: 'auto', fontSize: 11 }}>{w.confidence}</span></div>
              <div className={s.sub} style={{ fontSize: 12, marginTop: 3 }}>{w.measurement}</div>
            </div>
          ))}
          {!snapshot.pit_watch.length && <div className={s.empty}>No pit-window signal yet.</div>}
        </div>
      )}
    </div>
  )
}

function AfterFlag({ snapshot, isRace }: { snapshot: LiveSnapshot; isRace: boolean }) {
  const chaos = snapshot.chaos
  const items = [
    { t: 'Chaos Index', d: isRace && chaos?.score != null ? `Density so far ${chaos.score.toFixed(1)} over ${chaos.denominator_laps} laps. ${chaos.caveat}` : 'Needs the full race distance to mean anything. Shown after the chequered flag.' },
    { t: 'Session result', d: 'Published a few minutes after the official results appear on formula1.com.' },
    { t: 'Race analysis', d: 'Strategy, pit cycles and phases need the complete race; the full analysis is published on the race page after the flag.' },
  ]
  return (
    <div className={s.panel}>
      <div className={s.secHead}><h6 className={s.h6}>After the flag</h6><span className={s.sub}>Not judged live</span></div>
      <div className={s.list}>
        {items.map(lk => (
          <div key={lk.t} style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: 12, padding: '14px 20px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginTop: 2 }} aria-hidden><rect x="3" y="11" width="18" height="11" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <div><div style={{ fontSize: 15, fontWeight: 800 }}>{lk.t}</div><div className={s.sub} style={{ lineHeight: 1.5 }}>{lk.d}</div></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── feed coverage ───────────────────────────────────────────────────────────

const FEED: [string, string, boolean][] = [
  ['car_data', '≈3.7 Hz', false], ['location', '≈3.7 Hz', false], ['intervals', '≈4 s · race only', true], ['laps', 'Per lap', false],
  ['position', 'On change', false], ['pit', 'On event', false], ['stints', 'On change', false], ['weather', 'Every minute', false],
  ['race_control', 'On event', false], ['team_radio', 'On release', false], ['overtakes', 'Race only', true], ['drivers', 'Per session', false],
  ['session_result', 'After the flag', false],
]

function FeedCoverage({ snapshot, isRace }: { snapshot: LiveSnapshot; isRace: boolean }) {
  const f = snapshot.feed
  const at = new Date(snapshot.generated_at).getTime()
  const rows = FEED.map(([name, rate, raceOnly]) => {
    const count = f.messages[`v1/${name}`] ?? 0
    const last = f.last_update?.[`v1/${name}`]
    const fresh = last != null && at - new Date(last).getTime() < 120_000
    const status = fresh ? 'LIVE' : count ? 'IDLE' : raceOnly && !isRace ? 'RACE ONLY' : 'NO DATA'
    return { name, rate, count, status }
  })
  const live = rows.filter(r => r.status === 'LIVE').length
  return (
    <section className={s.section}>
      <div className={`${s.secHead} ${s.secHeadWide}`}>
        <h6 className={s.h6}>Feed coverage</h6><span className={s.sub}>Every OpenF1 topic this page is built from</span>
        <span className={s.secAside}>{live} live · {rows.length} total{f.gaps_observed_total ? ` · ${f.gaps_observed_total} gap${f.gaps_observed_total === 1 ? '' : 's'} observed` : ''}</span>
      </div>
      <div className={s.cells} style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
        {rows.map(r => (
          <div key={r.name} className={s.cell} style={{ padding: '12px 32px 12px 20px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px', opacity: r.status === 'LIVE' || r.count ? 1 : 0.6 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>/{r.name}</div>
            <div style={{ fontSize: 11, letterSpacing: '0.06em', fontWeight: 800, padding: '1px 8px', alignSelf: 'start', background: r.status === 'LIVE' ? 'var(--pw-text)' : 'transparent', color: r.status === 'LIVE' ? 'var(--pw-bg)' : 'var(--pw-text)', border: r.status === 'LIVE' ? 0 : '1px solid var(--pw-divider)' }}>{r.status}</div>
            <div className={s.sub}>{r.rate}</div>
            <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{r.count ? `${r.count.toLocaleString('en-US')} msgs` : '—'}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
