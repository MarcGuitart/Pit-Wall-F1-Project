'use client'

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import type { Recon } from './data'
import s from './recon.module.css'

export type MinimapHandle = { set: (s: number) => void }

/**
 * The circuit from above, north up: the line, the braking zones in red, the
 * part of the lap already driven brighter, and a dot where the lap is. The
 * page moves the dot every frame through the handle; React renders it once.
 */
export const Minimap = forwardRef<MinimapHandle, { recon: Recon; className?: string }>(function Minimap({ recon, className }, ref) {
  const W = 200, P = 8
  const geo = useMemo(() => {
    const xs = recon.line.map((p) => p[0]), ys = recon.line.map((p) => p[1])
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const k = (W - 2 * P) / Math.max(x1 - x0, y1 - y0)
    const H = Math.round((y1 - y0) * k + 2 * P)
    const pt = (x: number, y: number): [number, number] => [P + (x - x0) * k, H - P - (y - y0) * k]
    const pts = recon.line.map(([x, y]) => pt(x, y))
    // the point at arc length s, interpolated between the line's vertices
    const ss = recon.line_s
    const at = (sv: number): [number, number] => {
      const L = recon.length_m, x = ((sv % L) + L) % L
      let i = 0
      while (i < ss.length - 1 && ss[i + 1] < x) i++
      const j = (i + 1) % pts.length, b = j === 0 ? L : ss[j]
      const u = Math.max(0, Math.min(1, (x - ss[i]) / (b - ss[i] || 1)))
      return [pts[i][0] + u * (pts[j][0] - pts[i][0]), pts[i][1] + u * (pts[j][1] - pts[i][1])]
    }
    const span = (a: number, b: number) => {
      const out = [at(a)]
      ss.forEach((v, i) => { if (v > a && v < b) out.push(pts[i]) })
      out.push(at(b))
      return out.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')
    }
    const d = `M${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' L')} Z`
    return { H, d, at, span, zones: recon.zones.map((z) => ({ id: z.id, pts: span(z.from, Math.max(z.to, z.from + 8)) })) }
  }, [recon])
  const dot = useRef<SVGCircleElement>(null)
  const done = useRef<SVGPolylineElement>(null)
  useImperativeHandle(ref, () => ({
    set(sv: number) {
      const [x, y] = geo.at(sv)
      dot.current?.setAttribute('cx', x.toFixed(1))
      dot.current?.setAttribute('cy', y.toFixed(1))
      done.current?.setAttribute('points', geo.span(0, Math.max(0.1, sv)))
    },
  }), [geo])
  return (
    <svg className={`${s.minimap} ${className ?? ''}`} viewBox={`0 0 ${W} ${geo.H}`} role="img" aria-label={`${recon.circuit} from above, with the braking zones in red`}>
      <path d={geo.d} fill="none" stroke="var(--pw-text)" strokeOpacity={0.28} strokeWidth={2} strokeLinejoin="round" />
      <polyline ref={done} points="" fill="none" stroke="var(--pw-text)" strokeWidth={2} strokeLinejoin="round" />
      {geo.zones.map((z) => <polyline key={z.id} points={z.pts} fill="none" stroke="#ec3013" strokeWidth={3.5} />)}
      <circle ref={dot} r={4.5} cx={-10} cy={-10} fill="var(--pw-text)" stroke="var(--pw-bg)" strokeWidth={2} />
    </svg>
  )
})
