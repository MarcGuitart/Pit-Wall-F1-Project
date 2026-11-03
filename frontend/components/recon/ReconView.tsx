'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from 'react'
import { lapClock, lapPlayer, personName, sampleRate, stepMetres, zoneAhead, zoneFacts, zoneFocus, type Recon } from './data'
import { stillReason, wantsBloom, STILL_COPY, type StillReason } from './capability'
import { Minimap, type MinimapHandle } from './Minimap'
import type { Clock } from './scene'
import { displayNameOf } from '@/lib/displayName'
import { useReducedMotion } from '@/lib/motion'
import s from './recon.module.css'

type SceneHandle = { play: () => void; pause: () => void; dispose: () => void }

/**
 * The tour's state. `zone`: the camera sits still on zone `i`. `lap`: the fluid
 * lap plays and `i` is the zone it is heading for. `paused`: the lap stopped
 * where it was. Stepping always lands on a zone; nothing plays unless asked.
 */
type View = { mode: 'zone' | 'lap' | 'paused'; i: number; n: number }
type Act = { type: 'go'; i: number } | { type: 'play' } | { type: 'pause' } | { type: 'track'; i: number }

function tour(v: View, a: Act): View {
  switch (a.type) {
    case 'go': return { mode: 'zone', i: ((a.i % v.n) + v.n) % v.n, n: v.n }
    case 'play': return { ...v, mode: 'lap' }
    case 'pause': return v.mode === 'lap' ? { ...v, mode: 'paused' } : v
    case 'track': return v.mode === 'lap' && v.i !== a.i ? { ...v, i: a.i } : v
  }
}

const climbText = (m: number) => `${m > 0 ? '+' : m < 0 ? '−' : ''}${Math.abs(m)} m`

/**
 * The Recon Lap: header, the 3D stage (or its still image) with the zone
 * panel, the height profile and the braking-zone table. A tour of the pole
 * lap's braking zones, one at a time: arrow keys and buttons move between
 * them, the camera stays still on each, and the whole lap plays only on
 * request. The page renders all of it as HTML; the scene (three.js) is imported
 * once the page is up and the stage is on screen, and pauses when it leaves the
 * screen or the tab.
 */
export function ReconView({ recon }: { recon: Recon }) {
  const place = displayNameOf(recon) ?? recon.circuit
  const reduced = useReducedMotion()
  const [still, setStill] = useState<StillReason | null | undefined>(undefined)
  const [ready, setReady] = useState(false)
  const [view, dispatch] = useReducer(tour, { mode: 'zone', i: 0, n: recon.zones.length })
  const clock = useMemo<Clock>(() => ({ s: 0, focus: null, active: null, cut: false, inset: 0 }), [])
  const panel = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const labels = useRef<HTMLDivElement>(null)
  const mini = useRef<MinimapHandle>(null)
  const scene = useRef<SceneHandle | null>(null)
  const visible = useRef(true)

  const [posed, setPosed] = useState(false)  // ?pose=still: the overview the still image is captured from, no HUD
  useEffect(() => { setStill(stillReason()); setPosed(new URLSearchParams(location.search).get('pose') === 'still') }, [])
  useEffect(() => { clock.cut = reduced }, [clock, reduced])

  // how much of the stage the panel covers (it sits over its foot, except on a phone and with the still image)
  useEffect(() => {
    const st = stage.current, pn = panel.current
    if (!st || !pn) return
    const measure = () => {
      const over = window.innerWidth > 760 && !still
      clock.inset = over ? Math.min(0.5, (pn.offsetHeight + 16) / (st.clientHeight || 1)) : 0
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(st); ro.observe(pn)
    return () => ro.disconnect()
  }, [clock, still])

  // the scene: after the first paint, once the stage is near the screen
  useEffect(() => {
    if (still !== null || !stage.current) return
    let gone = false
    const io = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting
      if (!scene.current) {
        if (!e.isIntersecting) return
        const pose = new URLSearchParams(location.search).get('pose') === 'still' ? 'still' : undefined
        import('./scene').then(({ createScene }) => {
          if (gone || !canvas.current || !labels.current) return
          scene.current = createScene({
            canvas: canvas.current, labels: labels.current, recon, clock, bloom: wantsBloom(), pose,
            onFirstFrame: () => setReady(true), onLowFps: () => setStill('low-fps'),
          })
        })
      } else if (e.isIntersecting) scene.current.play()
      else scene.current.pause()
    }, { rootMargin: '200px' })
    io.observe(stage.current)
    return () => { gone = true; io.disconnect(); scene.current?.dispose(); scene.current = null }
  }, [still, recon, clock])

  // a zone: the camera still on it, the light at its minimum speed
  useEffect(() => {
    if (view.mode !== 'zone') return
    const z = recon.zones[view.i]
    clock.focus = zoneFocus(z); clock.s = z.apex; clock.active = z.id
    mini.current?.set(z.apex)
  }, [view, still, recon, clock])

  // the fluid lap: real time x 6 from just before the zone on show (or from where it was paused); stops off screen
  const at = useRef(view)
  at.current = view
  const lap = view.mode === 'lap' && still === null
  useEffect(() => {
    if (!lap) return
    const player = lapPlayer(recon)
    const s0 = clock.focus ? Math.max(0, recon.zones[at.current.i].from - 150) : clock.s
    clock.focus = null
    let raf = 0, last = performance.now(), elapsed = 0, heading = -1
    const loop = (now: number) => {
      if (visible.current && !document.hidden) elapsed += (now - last) / 1000
      last = now
      const sv = player.at(elapsed, s0)
      clock.s = sv
      mini.current?.set(sv)
      const next = zoneAhead(recon, sv)
      if (next !== heading) { heading = next; clock.active = recon.zones[next].id; dispatch({ type: 'track', i: next }) }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [lap, recon, clock])
  useEffect(() => { if (still && at.current.mode === 'lap') dispatch({ type: 'pause' }) }, [still])

  const go = useCallback((i: number) => dispatch({ type: 'go', i }), [])
  const toggle = useCallback(() => dispatch({ type: at.current.mode === 'lap' ? 'pause' : 'play' }), [])
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key === 'ArrowRight') go(view.i + 1)
    else if (e.key === 'ArrowLeft') go(view.i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(view.n - 1)
    else if (e.key === ' ' && e.target === stage.current && still === null) toggle()
    else return
    e.preventDefault()
  }

  const zone = recon.zones[view.i]
  const f = zoneFacts(recon, zone)
  const hz = sampleRate(recon.trace)
  const hzText = hz.toFixed(1).replace(/\.0$/, '')
  const byBrake = (recon.zones_by ?? 'brake') === 'brake'
  const playing = view.mode === 'lap'
  const driver = personName(recon.lap.driver_name) ?? recon.lap.driver

  return (
    <div className={s.page}>
      <header className={s.head}>
        <span className={s.kicker}><span className={s.square} aria-hidden />Recon Lap · {place} {recon.for_year}</span>
        <h1 className={s.h1}>{recon.circuit}, at pole pace</h1>
        <p className={s.lead}>
          {driver}&apos;s pole lap from {recon.year} qualifying, {lapClock(recon.lap.time)}: the line the car took, its recorded height and the {recon.zones.length} braking zones,
          ahead of the {recon.for_year} Grand Prix. Step through the zones with the arrow keys or the buttons{still === null ? ', or play the whole lap' : ''}.
        </p>
      </header>

      <div className={s.tour} onKeyDown={onKey} data-still={still ? 'true' : undefined}>
        <div className={s.stage} ref={stage} data-still={still ? 'true' : undefined} tabIndex={0} role="group"
          aria-label={`${recon.circuit} braking zones. Left and right arrow keys move to the previous or next zone${still === null ? '; space plays or pauses the lap' : ''}.`}>
          {/* The still holds the place (and is the whole view without the scene). */}
          <img className={s.still} src={`/recon/${recon.slug}-still.webp`} alt={`${recon.circuit} from above, its braking zones in red`}
            width={1600} height={900} style={{ opacity: still || !ready ? 1 : 0 }} />
          {still === null && (
            <>
              <canvas ref={canvas} className={s.canvas} aria-label={`${recon.circuit} in 3D, following the pole lap`} role="img" />
              <div ref={labels} className={s.labels} aria-hidden>
                {recon.zones.map((z) => <span key={z.id} data-bz={z.id} className={s.tag}>BZ{z.id}</span>)}
              </div>
              <div className={s.hud} hidden={posed}>
                <div className={s.top}><Minimap ref={mini} recon={recon} active={zone.id} /></div>
              </div>
              <span className={s.legend} hidden={posed}>Height ×2 · BZ = braking zone, not the FIA turn number</span>
            </>
          )}
        </div>

        <section ref={panel} className={s.panel} aria-label="Braking zone" hidden={posed}>
          {/* Heard on each change of zone, not while the lap plays: one sentence, not the whole panel. */}
          <p className={s.sr} role="status">
            {playing ? '' : `Braking zone ${f.id} of ${f.of}. Entry speed ${f.entry} kilometres per hour, minimum speed ${f.min}, braking distance ${f.metres} metres, ${f.seconds == null ? 'no brake time on this lap' : `time on the brakes ${f.seconds.toFixed(1)} seconds`}, gear ${f.gear}${f.climb == null ? '' : `, height change ${climbText(f.climb).replace('−', 'minus ')} metres`}. Approximate, car data sampled at about ${hzText} hertz.`}
          </p>
          <div className={s.pHead}>
            <div className={s.pId}>
              <span className={s.zoneNo}>BZ{f.id}</span>
              <span className={s.label}>{playing ? 'Heading for zone' : 'Zone'} {f.id} of {f.of}</span>
            </div>
            <div className={s.pBtns}>
              <button type="button" className={s.btn} onClick={() => go(view.i - 1)} aria-label="Previous zone"><Chevron dir="left" /><span>Previous</span></button>
              <button type="button" className={s.btn} onClick={() => go(view.i + 1)} aria-label="Next zone"><span>Next</span><Chevron dir="right" /></button>
              {still === null && <button type="button" className={s.btn} onClick={toggle}>{playing ? 'Pause lap' : 'Play lap'}</button>}
            </div>
            <span className={s.hint}>{reduced ? 'Reduced motion: the camera cuts between zones. ' : ''}Arrow keys: ← previous, → next</span>
          </div>
          <dl className={s.facts}>
            <div><dt>Entry speed</dt><dd>{f.entry}<small>km/h</small></dd></div>
            <div><dt>Minimum speed</dt><dd>{f.min}<small>km/h</small></dd></div>
            <div><dt>{byBrake ? 'Braking distance' : 'Hard speed loss over'}</dt><dd>{f.metres}<small>m</small></dd></div>
            <div><dt>Time on the brakes</dt><dd>{f.seconds == null ? 'n/a' : <>{f.seconds.toFixed(1)}<small>s</small></>}</dd></div>
            <div><dt>Gear at minimum</dt><dd>{f.gear}</dd></div>
            {f.climb != null && <div><dt>Height change</dt><dd>{climbText(f.climb)}</dd></div>}
          </dl>
          <p className={s.approx}>
            <b>Approximate.</b> Car data sampled at about {hzText} Hz, so a zone&apos;s start, end and time are good to one sample,
            about {Math.round(stepMetres(f.entry, hz))} m at this entry speed.{' '}
            {byBrake ? 'The brake channel is on or off.' : 'No brake signal on this lap: zones are found from the speed.'}
            {' '}Reference: {driver}, {recon.lap.kind} lap {lapClock(recon.lap.time)}, {recon.event} {recon.year} {recon.lap.session.toLowerCase()} (OpenF1 session {recon.session_key}).
          </p>
        </section>
      </div>
      {still && <p className={s.foot}>{STILL_COPY[still]}</p>}

      <Profile recon={recon} active={zone.id} />

      <section className={s.zones} aria-labelledby="bz-title">
        <div className={s.secHead}><h2 className={s.h6} id="bz-title">Braking zones</h2><span className={s.sub}>In lap order, from the pole lap&apos;s car data</span></div>
        <table className={s.table}>
          <thead><tr><th>Zone</th><th>Starts at</th><th>From</th><th>Min</th><th>Speed lost</th><th>Gear</th><th>On the brakes</th></tr></thead>
          <tbody>
            {recon.zones.map((z, i) => (
              <tr key={z.id} data-on={i === view.i ? 'true' : undefined}>
                <td><button type="button" className={s.rowBtn} onClick={() => go(i)} aria-current={i === view.i ? 'true' : undefined} aria-label={`Show zone ${z.id}`}>BZ{z.id}</button></td>
                <td>{Math.round(z.from)} m</td><td>{z.fromSpeed} km/h</td><td>{z.minSpeed} km/h</td>
                <td className={s.red}>−{z.drop} km/h</td><td>{z.gear}</td><td>{z.seconds == null ? 'n/a' : `${z.seconds.toFixed(1)} s`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={s.foot}>
          Braking zones are numbered along the lap (BZ1, BZ2…); they are not the FIA&apos;s turn numbers.{' '}
          {byBrake
            ? 'A zone is a stretch with the brake on and at least 20 km/h lost.'
            : 'This lap has no brake signal, so a zone is a stretch where the speed falls hard and at least 20 km/h is lost; the time on the brakes is not known.'}
          {' '}Distances are scaled to the official lap length, {Math.round(recon.length_m)} m
          {recon.length_source ? <> (<a href={recon.length_source} rel="noopener noreferrer" target="_blank">formula1.com</a>)</> : null}; the line the car
          took measures {Math.round(recon.measured_m)} m. Height is drawn ×2 and the height change of a zone is read from the recorded line, which is smoothed.
          Source: OpenF1 position and car data, {recon.year} qualifying.
        </p>
      </section>
    </div>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
      <path d={dir === 'left' ? 'M9 2 4 7l5 5' : 'M5 2l5 5-5 5'} />
    </svg>
  )
}

function Profile({ recon, active }: { recon: Recon; active: number }) {
  const W = 1000, H = 60
  const L = recon.length_m, zmax = recon.elevation_m || 1
  const d = `M${recon.line.map((p, i) => `${(recon.line_s[i] / L * W).toFixed(1)},${(H - 6 - (p[2] / zmax) * (H - 14)).toFixed(1)}`).join(' L')}`
  return (
    <figure className={s.profileFig}>
      <svg className={s.profile} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Height along the lap: ${zmax} m between the lowest and the highest point`}>
        {recon.zones.map((z) => <rect key={z.id} x={z.from / L * W} width={Math.max(2, (z.to - z.from) / L * W)} y={0} height={H} fill="#ec3013" opacity={z.id === active ? 0.9 : 0.3} />)}
        <path d={d} fill="none" stroke="var(--pw-text)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className={s.foot}>Height along the lap, 0 to {zmax} m (recorded) · red: braking zones, the zone on show brighter</figcaption>
    </figure>
  )
}
