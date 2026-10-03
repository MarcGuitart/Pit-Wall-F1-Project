'use client'

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import styles from './charts.module.css'
import {
  formatLap, fuelModel, gapToReference, lapTimeEvolution, SLOW_LAP_FACTOR, tyreDegradation,
  type ChartDriver, type GapReference, type NeutralBand, type Point, type Series, type StintFit,
} from '@/lib/lapCharts'

/**
 * The four lap-by-lap race charts. Shared by the live page and the race page:
 * both hand over the same ChartDriver[] and the same neutralisation bands.
 *
 * Legend: hover highlights, click selects, alt-click (or a long press on a
 * touch screen) isolates one driver; isolating it again brings the field back.
 */

// ── selection ───────────────────────────────────────────────────────────────

function useSelection(codes: string[], initial: number) {
  const key = codes.join(',')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(codes.slice(0, initial)))
  const [hover, setHover] = useState<string | null>(null)
  const [isolated, setIsolated] = useState<string | null>(null)
  const seeded = useRef(codes.length > 0)
  useEffect(() => {
    // The live field arrives a driver at a time; seed the default selection
    // once there is a field, and never override a choice made since.
    if (!seeded.current && codes.length) {
      seeded.current = true
      setSelected(new Set(codes.slice(0, initial)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const toggle = (c: string) => setSelected(s => {
    const n = new Set(s)
    if (n.has(c)) n.delete(c)
    else n.add(c)
    return n
  })
  const isolate = (c: string) => setIsolated(i => (i === c ? null : c))
  const visible = (c: string) => (isolated ? isolated === c : true)
  const strong = (c: string) => (isolated ? isolated === c : hover ? hover === c : selected.has(c))
  return { selected, hover, setHover, isolated, toggle, isolate, visible, strong }
}

type Selection = ReturnType<typeof useSelection>

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(900)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

// ── panel chrome ────────────────────────────────────────────────────────────

export function ChartPanel({ id, title, badge, description, how, actions, children }: {
  id: string
  title: string
  badge?: 'High' | 'Medium' | 'Low'
  description: string
  how: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const share = () => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => undefined)
  }
  return (
    <section id={id} className={styles.panel}>
      <div className={styles.head}>
        <div style={{ minWidth: 0, flex: '1 1 420px' }}>
          <div className={styles.titleRow}>
            <h3 className={styles.title}>{title}</h3>
            {badge && <span className={`${styles.badge} ${styles[`badge${badge}`]}`}>{badge}</span>}
          </div>
          <p className={styles.desc}>{description}</p>
        </div>
        <div className={styles.actions}>
          {actions}
          <button type="button" className={styles.btn} onClick={share}>{copied ? 'Copied' : 'Share'}</button>
        </div>
      </div>
      <details className={styles.how}>
        <summary>How this is computed</summary>
        <p>{how}</p>
      </details>
      {children}
    </section>
  )
}

function Legend({ series, sel }: { series: Series[]; sel: Selection }) {
  const press = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  return (
    <>
      <div className={styles.legend}>
        {series.map(s => (
          <button
            key={s.code}
            type="button"
            className={`${styles.pill} ${sel.strong(s.code) ? styles.pillOn : ''}`}
            style={{ opacity: sel.visible(s.code) ? 1 : 0.35 }}
            onMouseEnter={() => sel.setHover(s.code)}
            onMouseLeave={() => sel.setHover(null)}
            onFocus={() => sel.setHover(s.code)}
            onBlur={() => sel.setHover(null)}
            onPointerDown={e => {
              if (e.pointerType !== 'touch') return
              longPressed.current = false
              press.current = setTimeout(() => { longPressed.current = true; sel.isolate(s.code) }, 500)
            }}
            onPointerUp={() => { if (press.current) clearTimeout(press.current) }}
            onPointerCancel={() => { if (press.current) clearTimeout(press.current) }}
            onClick={e => {
              if (longPressed.current) { longPressed.current = false; return }
              if (e.altKey) sel.isolate(s.code)
              else sel.toggle(s.code)
            }}
            aria-pressed={sel.selected.has(s.code)}
          >
            <Swatch colour={s.colour} dashed={s.dashed} />
            <span>{s.code}</span>
            <span>{s.value}</span>
          </button>
        ))}
      </div>
      <div className={styles.hint}>hover highlights · click selects · alt-click or long-press isolates</div>
    </>
  )
}

function Swatch({ colour, dashed }: { colour: string; dashed: boolean }) {
  return (
    <svg width="22" height="8" aria-hidden>
      <line x1="1" x2="21" y1="4" y2="4" stroke={colour} strokeWidth="3" strokeDasharray={dashed ? '4 3' : undefined} />
    </svg>
  )
}

// ── a line chart over laps ──────────────────────────────────────────────────

const PAD = { top: 26, right: 16, bottom: 40, left: 72 }
const GRID = 'rgba(240,242,245,0.09)'
const AXIS = 'rgba(240,242,245,0.55)'
const BAND = { SC: 'rgba(255,176,32,0.12)', VSC: 'rgba(255,176,32,0.07)', RED: 'rgba(236,48,19,0.16)' } as const

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count + 1) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6))
  return out
}

function LapLineChart({ series, sel, xMax, yDomain, invertY, yFormat, bands, height = 380, zeroLabel, dots = false }: {
  series: Series[]
  sel: Selection
  xMax: number
  yDomain: [number, number]
  /** true when larger values should sit lower (time lost to the reference) */
  invertY?: boolean
  yFormat: (v: number) => string
  bands: NeutralBand[]
  height?: number
  zeroLabel?: string
  /** points instead of lines — for sessions where consecutive laps are not comparable */
  dots?: boolean
}) {
  const [wrap, width] = useWidth<HTMLDivElement>()
  const clip = useId().replace(/:/g, '')
  const [hoverLap, setHoverLap] = useState<number | null>(null)
  const iw = width - PAD.left - PAD.right
  const ih = height - PAD.top - PAD.bottom
  const [y0, y1] = yDomain
  const x = (lap: number) => PAD.left + ((lap - 1) / Math.max(1, xMax - 1)) * iw
  const y = (v: number) => {
    const f = (v - y0) / (y1 - y0 || 1)
    return PAD.top + (invertY ? f : 1 - f) * ih
  }
  const xTicks = Array.from({ length: Math.floor(xMax / 5) }, (_, i) => (i + 1) * 5)
  const yTicks = niceTicks(y0, y1)
  const ordered = [...series].sort((a, b) => Number(sel.strong(a.code)) - Number(sel.strong(b.code)))
  const path = (pts: Point[]) => {
    let d = ''
    let prev: number | null = null
    for (const [lap, v] of pts) {
      // a missing lap breaks the line rather than drawing across the gap…
      // except over a neutralised spell, where the gap is the story
      d += `${prev != null && lap - prev > 1 && !bands.some(b => prev! >= b.from - 1 && lap <= b.to + 1) ? 'M' : d ? 'L' : 'M'}${x(lap).toFixed(1)},${y(v).toFixed(1)}`
      prev = lap
    }
    return d
  }
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    if (px < PAD.left || px > width - PAD.right) return setHoverLap(null)
    setHoverLap(Math.round(1 + ((px - PAD.left) / iw) * (xMax - 1)))
  }
  const readout = hoverLap == null ? [] : series
    .filter(s => sel.visible(s.code) && sel.strong(s.code))
    .map(s => ({ s, p: s.points.find(p => p[0] === hoverLap) }))
    .filter((r): r is { s: Series; p: Point } => !!r.p)
    .slice(0, 8)

  return (
    <div ref={wrap} className={styles.body} style={{ position: 'relative' }}>
      <svg className={styles.svg} width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHoverLap(null)} role="img">
        <defs><clipPath id={clip}><rect x={PAD.left} y={PAD.top} width={iw} height={ih} /></clipPath></defs>
        {bands.map((b, i) => (
          <g key={i}>
            <rect x={x(b.from - 0.5)} y={PAD.top - 14} width={Math.max(4, x(b.to + 0.5) - x(b.from - 0.5))} height={ih + 14} fill={BAND[b.kind]} />
            <text x={(x(b.from - 0.5) + x(b.to + 0.5)) / 2} y={PAD.top - 2} textAnchor="middle" fill={AXIS} fontSize="10" fontWeight="800" letterSpacing="0.08em">{b.kind}</text>
          </g>
        ))}
        {yTicks.map(t => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fill={AXIS} fontSize="11">{yFormat(t)}</text>
          </g>
        ))}
        {zeroLabel && y0 <= 0 && y1 >= 0 && (
          <text x={PAD.left - 8} y={y(0) + 4} textAnchor="end" fill="#ec3013" fontSize="11" fontWeight="800">{zeroLabel}</text>
        )}
        <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + ih} y2={PAD.top + ih} stroke={AXIS} strokeWidth="2" />
        {xTicks.map(t => <text key={t} x={x(t)} y={PAD.top + ih + 18} textAnchor="middle" fill={AXIS} fontSize="11">Lap {t}</text>)}
        <text x={PAD.left + iw / 2} y={height - 4} textAnchor="middle" fill={AXIS} fontSize="10" letterSpacing="0.1em">LAP</text>
        <g clipPath={`url(#${clip})`}>
          {ordered.map(s => {
            if (!sel.visible(s.code)) return null
            const on = sel.strong(s.code)
            return (
              <g key={s.code} opacity={on ? 1 : 0.22}>
                {dots
                  ? s.points.map(([lap, v]) => (
                      <rect key={lap} x={x(lap) - (on ? 4.5 : 3)} y={y(v) - (on ? 4.5 : 3)} width={on ? 9 : 6} height={on ? 9 : 6}
                        fill={s.dashed ? '#05060a' : s.colour} stroke={s.colour} strokeWidth="2" />
                    ))
                  : <path d={path(s.points)} fill="none" stroke={s.colour} strokeWidth={on ? 2.4 : 1.1}
                      strokeDasharray={s.dashed ? '6 4' : undefined} strokeLinejoin="round" />}
                {on && s.markers?.map(([lap, v]) => <circle key={lap} cx={x(lap)} cy={y(v)} r="3.5" fill={s.colour} stroke="#05060a" strokeWidth="1.5" />)}
              </g>
            )
          })}
        </g>
        {hoverLap != null && <line x1={x(hoverLap)} x2={x(hoverLap)} y1={PAD.top} y2={PAD.top + ih} stroke={AXIS} strokeDasharray="2 3" />}
      </svg>
      {hoverLap != null && readout.length > 0 && (
        <div style={{
          position: 'absolute', top: 18, left: Math.min(x(hoverLap) + 32, width - 170), pointerEvents: 'none',
          background: '#0b0d12', border: '2px solid rgba(240,242,245,0.16)', padding: '6px 10px', fontSize: 12, minWidth: 140,
        }}>
          <div style={{ fontWeight: 800, letterSpacing: '0.06em', marginBottom: 4 }}>LAP {hoverLap}</div>
          {readout.map(({ s, p }) => (
            <div key={s.code} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Swatch colour={s.colour} dashed={s.dashed} /><b>{s.code}</b><span style={{ marginLeft: 'auto' }}>{yFormat(p[1])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── the four charts ─────────────────────────────────────────────────────────

/** Qualifying / practice: every push lap as a point; the best of each driver is the value. */
function PushLapChart({ data, drivers, idPrefix }: { data: ReturnType<typeof lapTimeEvolution>; drivers: ChartDriver[]; idPrefix: string }) {
  const ordered = [...data.series].sort((a, b) => Math.min(...a.points.map(p => p[1]), Infinity) - Math.min(...b.points.map(p => p[1]), Infinity))
  const sel = useSelection(ordered.map(s => s.code), 6)
  const xMax = Math.max(2, ...drivers.flatMap(d => d.laps.map(l => l.lap)))
  const pts = ordered.flatMap(s => s.points.map(p => p[1]))
  return (
    <ChartPanel
      id={`${idPrefix}-push-laps`}
      title="Push laps"
      description="Every flying lap of the session, as a point. Out-laps, cool-down laps and pit laps are left out — only laps within 7 % of the session's best. The value beside each driver is their best."
      how="In qualifying and practice consecutive laps are not comparable: a push lap is followed by a cool-down lap and often a run back to the garage. So nothing is joined by a line, and only laps within 107 % of the session's fastest are drawn. Square = a lap; hollow squares are the second car of a team."
    >
      {pts.length ? (
        <>
          <LapLineChart series={ordered} sel={sel} xMax={xMax} yDomain={[Math.min(...pts) - 0.15, Math.max(...pts) + 0.15]} yFormat={formatLap} bands={[]} dots height={340} />
          <Legend series={ordered} sel={sel} />
        </>
      ) : <div className={styles.empty}>No push lap yet.</div>}
    </ChartPanel>
  )
}

const DEFAULT_SELECTED = 6

export function LapTimeEvolutionChart({ drivers, bands, idPrefix = 'chart', session = 'race' }: {
  drivers: ChartDriver[]; bands: NeutralBand[]; idPrefix?: string; session?: 'race' | 'single-lap'
}) {
  const data = useMemo(() => lapTimeEvolution(drivers, session), [drivers, session])
  if (session === 'single-lap') {
    return <PushLapChart data={data} drivers={drivers} idPrefix={idPrefix} />
  }
  const sel = useSelection(data.series.map(s => s.code), DEFAULT_SELECTED)
  const xMax = Math.max(2, ...drivers.flatMap(d => d.laps.map(l => l.lap)))
  return (
    <ChartPanel
      id={`${idPrefix}-lap-times`}
      title="Lap-time evolution"
      description={`Every driver's lap time, lap by lap. Pit in/out laps and lap 1 are left out; laps slower than ${Math.round((SLOW_LAP_FACTOR - 1) * 100)} % over the field median (safety car, damage) fall outside the frame. Bands mark safety-car, VSC and red-flag periods.`}
      how={`Each point is a completed lap's official time. Lap 1 (standing start) and any lap that begins or ends in the pit lane are removed. The frame's ceiling is the field's median clean lap × ${SLOW_LAP_FACTOR.toFixed(2)}; slower laps are still plotted but clipped, so a lap under the safety car shows as a line leaving the top. The value beside each driver is their median in-frame lap.`}
    >
      {data.series.some(s => s.points.length) ? (
        <>
          <LapLineChart series={data.series} sel={sel} xMax={xMax} yDomain={data.yDomain} yFormat={formatLap} bands={bands} />
          <Legend series={data.series} sel={sel} />
        </>
      ) : <div className={styles.empty}>No completed racing laps yet — the first points appear once lap 2 is done.</div>}
    </ChartPanel>
  )
}

export function GapToReferenceChart({ drivers, bands, winnerCode, idPrefix = 'chart' }: {
  drivers: ChartDriver[]
  bands: NeutralBand[]
  /** the classified winner — set on a finished race; live has none */
  winnerCode?: string | null
  idPrefix?: string
}) {
  const [refCode, setRefCode] = useState<string>(winnerCode ? 'winner' : 'leader')
  const ref: GapReference = refCode === 'leader' ? { kind: 'leader' }
    : refCode === 'winner' && winnerCode ? { kind: 'driver', code: winnerCode }
      : { kind: 'driver', code: refCode }
  const data = useMemo(() => gapToReference(drivers, ref), [drivers, refCode, winnerCode]) // eslint-disable-line react-hooks/exhaustive-deps
  const sel = useSelection(data.series.map(s => s.code), DEFAULT_SELECTED)
  const all = data.series.flatMap(s => s.points.map(p => p[1]))
  // Cap the frame at the field's 90th percentile: one car a lap down would
  // otherwise flatten everyone else into the reference line.
  const sorted = [...all].sort((a, b) => a - b)
  const cap = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 10
  const refName = ref.kind === 'leader' ? 'LEADER' : `${ref.code}${refCode === 'winner' ? ' (winner)' : ''}`
  return (
    <ChartPanel
      id={`${idPrefix}-gap`}
      title="Gap to reference, lap by lap"
      description="Cumulative race time against the reference. Flat = same pace; falling = losing time. Pit stops show as steps; shaded bands are safety-car, VSC and red-flag periods."
      how="Each driver's completed lap times are summed from lap 1; the reference's sum at the same lap is subtracted. A driver only appears while their laps are contiguous from the start — a lap missing from the feed ends their line rather than inventing the time. Dots are pit-in laps. 'Leader' is whoever has the lowest cumulative time at each lap."
      actions={
        <select className={styles.select} value={refCode} onChange={e => setRefCode(e.target.value)} aria-label="Reference">
          {winnerCode && <option value="winner">vs winner</option>}
          <option value="leader">vs leader</option>
          {drivers.map(d => <option key={d.code} value={d.code}>vs {d.code}</option>)}
        </select>
      }
    >
      {all.length ? (
        <>
          <LapLineChart series={data.series} sel={sel} xMax={Math.max(2, data.maxLap)} yDomain={[Math.min(0, ...all), Math.max(cap, 1)]}
            invertY yFormat={v => (v === 0 ? '0' : `+${v.toFixed(1)}`)} bands={bands} zeroLabel={refName} />
          <Legend series={data.series} sel={sel} />
        </>
      ) : <div className={styles.empty}>No driver has a contiguous run of laps from the start yet.</div>}
    </ChartPanel>
  )
}

export function TyreDegradationChart({ drivers, bands, totalLaps, idPrefix = 'chart' }: {
  drivers: ChartDriver[]
  bands: NeutralBand[]
  totalLaps: number
  idPrefix?: string
}) {
  const [view, setView] = useState<'stints' | 'drivers'>('stints')
  const [wrap, width] = useWidth<HTMLDivElement>()
  const { fits, confidence } = useMemo(() => tyreDegradation(drivers, bands, totalLaps), [drivers, bands, totalLaps])
  const finite = fits.filter(f => Number.isFinite(f.ci))
  const shown = [...finite].sort((a, b) => a.slope - b.slope).slice(0, 6)
  const height = 340
  const iw = width - PAD.left - PAD.right
  const ih = height - PAD.top - PAD.bottom
  const xs = shown.flatMap(f => f.points.map(p => p[0]))
  const ys = shown.flatMap(f => f.points.map(p => p[1]))
  const [x0, x1] = [Math.min(...xs, 1), Math.max(...xs, 2)]
  const [y0, y1] = [Math.min(...ys) - 0.2, Math.max(...ys) + 0.2]
  const X = (v: number) => PAD.left + ((v - x0) / (x1 - x0 || 1)) * iw
  const Y = (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0 || 1)) * ih
  const byDriver = useMemo(() => {
    const m = new Map<string, StintFit[]>()
    for (const f of finite) m.set(f.code, [...(m.get(f.code) ?? []), f])
    return Array.from(m.entries()).map(([code, fs]) => ({
      code, colour: fs[0].colour,
      slope: fs.reduce((a, f) => a + f.slope * f.points.length, 0) / fs.reduce((a, f) => a + f.points.length, 0),
      laps: fs.reduce((a, f) => a + f.points.length, 0), stints: fs.length, cliff: fs.some(f => f.cliffAge != null),
    })).sort((a, b) => a.slope - b.slope)
  }, [finite])

  return (
    <ChartPanel
      id={`${idPrefix}-tyres`}
      title="Tyre degradation"
      badge={confidence}
      description="How much slower each stint got per lap of tyre age, once fuel burn is taken out. Each fit carries its interval and R², and a two-segment test flags a cliff. Negative slopes are allowed — a tyre coming in is a real thing."
      how="Per stint: clean laps only (no lap 1, no pit in/out laps, no neutralised laps, nothing slower than 107 % of the stint's median). Each time is corrected to race-end fuel with the fuel model below, then a least-squares line is fitted against tyre age (age at fitting plus laps run). The ± is the slope's 95 % interval. A cliff is flagged where two lines, split at least three laps from either end, cut the residual error by 40 % and the second is steeper by more than 0.05 s/lap."
      actions={
        <div className={styles.seg} role="radiogroup" aria-label="View">
          {(['stints', 'drivers'] as const).map(v => (
            <label key={v}><input type="radio" name={`${idPrefix}-deg-view`} checked={view === v} onChange={() => setView(v)} />{v}</label>
          ))}
        </div>
      }
    >
      {!finite.length ? <div className={styles.empty}>No stint has {5} clean laps yet.</div> : view === 'stints' ? (
        <div ref={wrap} className={styles.body}>
          <svg className={styles.svg} width={width} height={height} role="img">
            {niceTicks(y0, y1).map(t => (
              <g key={t}><line x1={PAD.left} x2={width - PAD.right} y1={Y(t)} y2={Y(t)} stroke={GRID} />
                <text x={PAD.left - 8} y={Y(t) + 4} textAnchor="end" fill={AXIS} fontSize="11">{formatLap(t)}</text></g>
            ))}
            {niceTicks(x0, x1, 8).filter(t => Number.isInteger(t)).map(t => (
              <text key={t} x={X(t)} y={PAD.top + ih + 18} textAnchor="middle" fill={AXIS} fontSize="11">{t} laps</text>
            ))}
            <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + ih} y2={PAD.top + ih} stroke={AXIS} strokeWidth="2" />
            <text x={PAD.left + iw / 2} y={height - 4} textAnchor="middle" fill={AXIS} fontSize="10" letterSpacing="0.1em">TYRE AGE</text>
            {shown.map(f => {
              const a = f.points[0][0], b = f.points[f.points.length - 1][0]
              return (
                <g key={`${f.code}-${f.stint}`}>
                  <polyline points={f.points.map(p => `${X(p[0])},${Y(p[1])}`).join(' ')} fill="none" stroke={f.colour} strokeWidth="2" />
                  <line x1={X(a)} x2={X(b)} y1={Y(f.intercept + f.slope * a)} y2={Y(f.intercept + f.slope * b)} stroke={f.colour} strokeWidth="2" strokeDasharray="7 5" opacity="0.85" />
                  {f.cliffAge != null && <circle cx={X(f.cliffAge)} cy={Y(f.intercept + f.slope * f.cliffAge)} r="5" fill="none" stroke="#ec3013" strokeWidth="2" />}
                </g>
              )
            })}
          </svg>
          <table className={styles.table} style={{ marginTop: 10 }}>
            <thead><tr><th>Stint</th><th>Compound</th><th>Laps</th><th>Slope</th><th>R²</th><th>Cliff</th></tr></thead>
            <tbody>{shown.map(f => (
              <tr key={`${f.code}-${f.stint}`}>
                <td><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontWeight: 800 }}><Swatch colour={f.colour} dashed={f.dashed} />{f.code} S{f.stint}</span></td>
                <td>{f.compound}</td><td>{f.points.length}</td>
                <td style={{ fontWeight: 800 }}>{f.slope >= 0 ? '+' : ''}{(f.slope * 1000).toFixed(0)} ms/lap <span style={{ opacity: 0.6, fontWeight: 400 }}>± {(f.ci * 1000).toFixed(0)}</span></td>
                <td>{f.r2.toFixed(2)}</td><td>{f.cliffAge != null ? `at ${f.cliffAge} laps` : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className={styles.hint} style={{ padding: '10px 0 0' }}>The six lowest-degradation stints — dashed lines are the fits.</div>
        </div>
      ) : (
        <div className={styles.body}>
          <table className={styles.table}>
            <thead><tr><th>Driver</th><th>Weighted slope</th><th></th><th>Stints</th><th>Laps</th><th>Cliff</th></tr></thead>
            <tbody>{byDriver.map(d => {
              const max = Math.max(...byDriver.map(r => Math.abs(r.slope)), 0.001)
              return (
                <tr key={d.code}>
                  <td style={{ fontWeight: 800 }}>{d.code}</td>
                  <td style={{ fontWeight: 800 }}>{d.slope >= 0 ? '+' : ''}{(d.slope * 1000).toFixed(0)} ms/lap</td>
                  <td style={{ width: '40%' }}><div style={{ height: 8, background: 'rgba(240,242,245,0.08)' }}><div style={{ height: '100%', width: `${Math.abs(d.slope) / max * 100}%`, background: d.slope > 0 ? d.colour : 'rgba(240,242,245,0.4)' }} /></div></td>
                  <td>{d.stints}</td><td>{d.laps}</td><td>{d.cliff ? 'Yes' : '—'}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}
    </ChartPanel>
  )
}

export function FuelModelPanel({ totalLaps, idPrefix = 'chart' }: { totalLaps: number; idPrefix?: string }) {
  const m = fuelModel(totalLaps)
  const [wrap, width] = useWidth<HTMLDivElement>()
  const height = 200
  const iw = width - PAD.left - PAD.right - 150
  const ih = height - PAD.top - PAD.bottom
  const X = (lap: number) => PAD.left + ((lap - 1) / Math.max(1, m.laps - 1)) * iw
  const Y = (v: number) => PAD.top + (1 - v / Math.max(0.01, m.overRaceS)) * ih
  const last = m.curve[m.curve.length - 1]
  return (
    <ChartPanel
      id={`${idPrefix}-fuel`}
      title="Fuel model"
      badge="Low"
      description={`Every pace figure in these charts is corrected to race-end fuel load with this model. The textbook ${m.effectMsPerKg} ms/kg is used — fuel and tyre wear change lap time together on every lap, so this race cannot separate its own fuel effect from its laps.`}
      how={`A ${m.startKg} kg start load burned evenly over ${m.laps} laps is ${m.perLapKg.toFixed(2)} kg a lap. At ${m.effectMsPerKg} ms per kg that is ${m.perLapMs.toFixed(0)} ms a lap: a lap run with n laps still to go is corrected by n × ${m.perLapMs.toFixed(0)} ms. The confidence is Low by construction — it is a default, not a measurement of this race.`}
    >
      <div className={styles.stats}>
        <div className={styles.stat}><div className={styles.statLabel}><span style={{ width: 8, height: 8, background: 'oklch(0.85 0.16 90)', display: 'inline-block' }} />Effect</div><div className={styles.statValue}>{m.effectMsPerKg} ms/kg</div><div className={styles.statSub}>default · not fitted from this race</div></div>
        <div className={styles.stat}><div className={styles.statLabel}>Start load</div><div className={styles.statValue}>{m.startKg} kg</div><div className={styles.statSub}>{m.perLapKg.toFixed(2)} kg per lap</div></div>
        <div className={styles.stat}><div className={styles.statLabel}>Per lap</div><div className={styles.statValue}>{m.perLapMs.toFixed(0)} ms</div><div className={styles.statSub}>quicker every lap from fuel alone</div></div>
        <div className={styles.stat}><div className={styles.statLabel}>Over the race</div><div className={styles.statValue}>{m.overRaceS.toFixed(2)} s</div><div className={styles.statSub}>lap 1 vs empty tanks</div></div>
      </div>
      <div ref={wrap} className={styles.body}>
        <svg className={styles.svg} width={width} height={height} role="img">
          {niceTicks(0, m.overRaceS, 3).map(t => (
            <g key={t}><line x1={PAD.left} x2={PAD.left + iw} y1={Y(t)} y2={Y(t)} stroke={GRID} />
              <text x={PAD.left - 8} y={Y(t) + 4} textAnchor="end" fill={AXIS} fontSize="11">{t.toFixed(2)} s</text></g>
          ))}
          <line x1={PAD.left} x2={PAD.left + iw} y1={PAD.top + ih} y2={PAD.top + ih} stroke={AXIS} strokeWidth="2" />
          {Array.from({ length: Math.floor(m.laps / 5) }, (_, i) => (i + 1) * 5).map(t => (
            <text key={t} x={X(t)} y={PAD.top + ih + 18} textAnchor="middle" fill={AXIS} fontSize="11">Lap {t}</text>
          ))}
          <polyline points={m.curve.map(([l, v]) => `${X(l)},${Y(v)}`).join(' ')} fill="none" stroke="#ec3013" strokeWidth="2.5" />
          {last && <><circle cx={X(last[0])} cy={Y(last[1])} r="4" fill="#ec3013" />
            <text x={X(last[0]) + 10} y={Y(last[1]) + 4} fill={AXIS} fontSize="11">Lap-time gain from fuel burn</text></>}
        </svg>
      </div>
    </ChartPanel>
  )
}

/** All four, in the order a race is read. */
export function RaceLapCharts({ drivers, bands, totalLaps, winnerCode, idPrefix }: {
  drivers: ChartDriver[]
  bands: NeutralBand[]
  totalLaps: number
  winnerCode?: string | null
  idPrefix?: string
}) {
  return (
    <div style={{ display: 'grid', gap: 2, background: 'var(--pw-divider, rgba(240,242,245,0.16))' }}>
      <LapTimeEvolutionChart drivers={drivers} bands={bands} idPrefix={idPrefix} />
      <GapToReferenceChart drivers={drivers} bands={bands} winnerCode={winnerCode} idPrefix={idPrefix} />
      <TyreDegradationChart drivers={drivers} bands={bands} totalLaps={totalLaps} idPrefix={idPrefix} />
      <FuelModelPanel totalLaps={totalLaps} idPrefix={idPrefix} />
    </div>
  )
}
