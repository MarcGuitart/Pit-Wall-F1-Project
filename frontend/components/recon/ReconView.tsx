'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lapClock, personName, timeline, traceAt, type Recon } from './data'
import { stillReason, wantsBloom, STILL_COPY, type StillReason } from './capability'
import { Minimap, type MinimapHandle } from './Minimap'
import type { Clock } from './scene'
import { displayNameOf } from '@/lib/displayName'
import s from './recon.module.css'

type SceneHandle = { play: () => void; pause: () => void; dispose: () => void }

/**
 * The Recon Lap: header, the 3D stage (or its still image), the height
 * profile and the braking-zone table. The page renders all of it as HTML; the
 * scene (three.js) is imported once the page is up and the stage is on screen,
 * and pauses when it leaves the screen or the tab.
 */
export function ReconView({ recon }: { recon: Recon }) {
  const place = displayNameOf(recon) ?? recon.circuit
  const [still, setStill] = useState<StillReason | null | undefined>(undefined)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [, tick] = useState(0)
  const clock = useMemo<Clock>(() => ({ s: 0, stop: null }), [])
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const labels = useRef<HTMLDivElement>(null)
  const mini = useRef<MinimapHandle>(null)
  const scene = useRef<SceneHandle | null>(null)
  const visible = useRef(true)
  const elapsed = useRef(0)

  const [posed, setPosed] = useState(false)  // ?pose=still: the overview the still image is captured from, no HUD
  useEffect(() => { setStill(stillReason()); setPosed(new URLSearchParams(location.search).get('pose') === 'still') }, [])

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

  // the lap clock: real time × 6, holding at each braking zone; stops while paused or off screen
  useEffect(() => {
    if (still !== null || !playing) return
    const tl = timeline(recon)
    let raf = 0, last = performance.now()
    const loop = (now: number) => {
      if (visible.current && !document.hidden) elapsed.current += (now - last) / 1000
      last = now
      const r = tl.at(elapsed.current)
      clock.s = r.s; clock.stop = r.stop
      mini.current?.set(r.s)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const id = setInterval(() => tick((n) => n + 1), 100)
    return () => { cancelAnimationFrame(raf); clearInterval(id) }
  }, [still, playing, recon, clock])

  const toggle = useCallback(() => setPlaying((p) => !p), [])
  const x = traceAt(recon.trace, clock.s)
  const ahead = recon.zones.find((z) => z.apex >= clock.s - 60 && z.from - clock.s < 450)
  const zone = clock.stop != null ? recon.zones.find((z) => z.id === clock.stop) : ahead
  const braking = !!zone && clock.s >= zone.from && clock.s <= zone.apex + 10

  return (
    <div className={s.page}>
      <header className={s.head}>
        <span className={s.kicker}><span className={s.square} aria-hidden />Recon Lap · {place} {recon.for_year}</span>
        <h1 className={s.h1}>{recon.circuit}, at pole pace</h1>
        <p className={s.lead}>
          {personName(recon.lap.driver_name) ?? recon.lap.driver}&apos;s pole lap from {recon.year} qualifying, {lapClock(recon.lap.time)}: the line the car took,
          its recorded height and the {recon.zones.length} braking zones, ahead of the {recon.for_year} Grand Prix.
        </p>
      </header>

      <div className={s.stage} ref={stage} data-still={still ? 'true' : undefined}>
        {/* The still holds the place (and is the whole view without motion or on a slow device). */}
        <img className={s.still} src={`/recon/${recon.slug}-still.webp`} alt={`${recon.circuit} from above, its braking zones in red`}
          width={1600} height={900} style={{ opacity: still || !ready ? 1 : 0 }} />
        {still === null && (
          <>
            <canvas ref={canvas} className={s.canvas} aria-label={`${recon.circuit} in 3D, following the pole lap`} role="img" />
            <div ref={labels} className={s.labels} aria-hidden>
              {recon.zones.map((z) => <span key={z.id} data-bz={z.id} className={s.tag}>BZ{z.id}</span>)}
            </div>
            <div className={s.hud} hidden={posed}>
              <div className={s.top}>
                <Minimap ref={mini} recon={recon} />
                <button className={s.btn} onClick={toggle} aria-pressed={!playing}>{playing ? 'Pause' : 'Play'}</button>
              </div>
              <div className={s.bottom}>
                <div className={s.gauges}>
                  <div className={s.gcell}><span className={s.label}>Speed km/h</span><span className={s.speed}>{Math.round(x.speed)}</span></div>
                  <div className={s.gcell}><span className={s.label}>Gear</span><span className={s.gear}>{x.gear}</span></div>
                  <div className={s.bars}>
                    <div className={s.bar}><span>Throttle</span><div className={s.barTrack}><div style={{ width: `${x.throttle}%`, background: 'var(--pw-text)' }} /></div><b>{Math.round(x.throttle)}</b></div>
                    <div className={s.bar}><span>Brake</span><div className={s.barTrack}><div style={{ width: x.brake ? '100%' : '0%', background: 'var(--pw-accent)' }} /></div><b>{x.brake ? 'ON' : 'off'}</b></div>
                  </div>
                  <div className={s.clock}><span>Lap <b>{lapClock(x.time)}</b></span><span><b>{Math.round(clock.s)}</b> / {Math.round(recon.length_m)} m</span></div>
                </div>
                {zone ? (
                  <div className={s.card} data-on={braking || clock.stop != null ? 'true' : 'false'}>
                    <div className={s.cardHead}><span className={s.cardId}>BZ{zone.id}</span><span className={s.label}>Braking zone {zone.id} · {Math.round(zone.to - zone.from)} m from {zone.fromSpeed} km/h</span></div>
                    <div className={s.cardRows}>
                      <div><span className={s.label}>Min km/h</span><span className={s.num}>{zone.minSpeed}</span></div>
                      <div><span className={s.label}>Gear</span><span className={s.num}>{zone.gear}</span></div>
                      <div><span className={s.label}>Speed lost</span><span className={`${s.num} ${s.red}`}>−{zone.drop}</span></div>
                    </div>
                  </div>
                ) : <div />}
              </div>
            </div>
            <span className={s.legend} hidden={posed}>Height ×2 · BZ = braking zone, not the FIA turn number</span>
          </>
        )}
      </div>
      {still && <p className={s.foot}>{STILL_COPY[still]}</p>}

      <Profile recon={recon} />

      <section className={s.zones} aria-labelledby="bz-title">
        <div className={s.secHead}><h2 className={s.h6} id="bz-title">Braking zones</h2><span className={s.sub}>In lap order, from the pole lap&apos;s car data</span></div>
        <table className={s.table}>
          <thead><tr><th>Zone</th><th>Starts at</th><th>From</th><th>Min</th><th>Speed lost</th><th>Gear</th><th>On the brakes</th></tr></thead>
          <tbody>
            {recon.zones.map((z) => (
              <tr key={z.id}>
                <td>BZ{z.id}</td><td>{Math.round(z.from)} m</td><td>{z.fromSpeed} km/h</td><td>{z.minSpeed} km/h</td>
                <td className={s.red}>−{z.drop} km/h</td><td>{z.gear}</td><td>{z.seconds.toFixed(1)} s</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={s.foot}>
          Braking zones are numbered along the lap (BZ1, BZ2…); they are not the FIA&apos;s turn numbers. A zone is a stretch with the brake
          on and at least 20 km/h lost. Distances are scaled to the official lap length, {Math.round(recon.length_m)} m
          {recon.length_source ? <> (<a href={recon.length_source} rel="noopener noreferrer" target="_blank">formula1.com</a>)</> : null}; the line the car
          took measures {Math.round(recon.measured_m)} m. Height is drawn ×2. Source: OpenF1 position and car data, {recon.year} qualifying.
        </p>
      </section>
    </div>
  )
}

function Profile({ recon }: { recon: Recon }) {
  const W = 1000, H = 60
  const L = recon.length_m, zmax = recon.elevation_m || 1
  const d = `M${recon.line.map((p, i) => `${(recon.line_s[i] / L * W).toFixed(1)},${(H - 6 - (p[2] / zmax) * (H - 14)).toFixed(1)}`).join(' L')}`
  return (
    <figure className={s.profileFig}>
      <svg className={s.profile} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Height along the lap: ${zmax} m between the lowest and the highest point`}>
        {recon.zones.map((z) => <rect key={z.id} x={z.from / L * W} width={Math.max(2, (z.to - z.from) / L * W)} y={0} height={H} fill="#ec3013" opacity={0.35} />)}
        <path d={d} fill="none" stroke="var(--pw-text)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className={s.foot}>Height along the lap, 0 to {zmax} m (recorded) · red: braking zones</figcaption>
    </figure>
  )
}
