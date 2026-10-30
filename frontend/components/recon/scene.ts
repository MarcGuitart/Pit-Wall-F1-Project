/**
 * The Recon Lap's 3D scene, in plain three.js with named imports (no React
 * renderer, no effect library): what the bundle carries is only what this
 * file and the bloom pass use. Loaded on demand by ReconStage.
 *
 * Track frame → world: x stays east, height goes up (×EXAG), north goes to −z.
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color,
  DoubleSide, Float32BufferAttribute, Fog, GridHelper, HalfFloatType, Line, LineBasicMaterial, LineDashedMaterial, Mesh,
  MeshBasicMaterial, NoToneMapping, PerspectiveCamera, PlaneGeometry, Points, PointsMaterial, SRGBColorSpace, Scene, Vector2, Vector3,
  WebGLRenderer, WebGLRenderTarget,
} from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { traceAt, type Recon } from './data'

export const EXAG = 2
const C = { bg: '#05060a', ground: '#07080c', asphalt: '#111318', text: '#f0f2f5', accent: '#ec3013' }
const UP = new Vector3(0, 1, 0)
const hot = (hex: string, k: number) => new Color(hex).multiplyScalar(k)

export type Clock = { s: number; stop: number | null }
export type SceneState = { frames: number; dpr: number; bloom: boolean }

declare global { interface Window { __pw3d?: SceneState } }

function trackModel(r: Recon) {
  const pts = r.line.map(([x, y, z]) => new Vector3(x, z * EXAG, -y))
  const curve = new CatmullRomCurve3(pts, true, 'centripetal')
  curve.arcLengthDivisions = 4000
  const L = r.length_m
  const u = (s: number) => (((s / L) % 1) + 1) % 1
  const at = (s: number, out = new Vector3()) => curve.getPointAt(u(s), out)
  const tangent = (s: number, out = new Vector3()) => curve.getTangentAt(u(s), out)
  const lateral = (s: number, out = new Vector3()) => { tangent(s, out); return out.set(out.x, 0, out.z).normalize().cross(UP) }
  const strip = (s0: number, s1: number, width: number, lift: number, step = 5) => {
    const n = Math.max(2, Math.ceil((s1 - s0) / step))
    const pos = new Float32Array((n + 1) * 6)
    const p = new Vector3(), l = new Vector3()
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n
      at(s, p); lateral(s, l)
      pos.set([p.x + l.x * width / 2, p.y + lift, p.z + l.z * width / 2, p.x - l.x * width / 2, p.y + lift, p.z - l.z * width / 2], i * 6)
    }
    const idx: number[] = []
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setIndex(idx)
    return g
  }
  const edge = (offset: number, step = 6) => {
    const out: Vector3[] = []
    const l = new Vector3()
    for (let s = 0; s <= L; s += step) { const p = at(s); lateral(s, l); out.push(p.addScaledVector(l, offset).setY(p.y + 0.2)) }
    out.push(out[0].clone())
    return new BufferGeometry().setFromPoints(out)
  }
  /** A faint wall from the line to the ground: height made legible. Alpha is in linear light (≈10 % grey on screen). */
  const wall = (step = 8) => {
    const n = Math.ceil(L / step)
    const pos = new Float32Array((n + 1) * 6), col = new Float32Array((n + 1) * 8)
    const p = new Vector3()
    for (let i = 0; i <= n; i++) {
      at((L * i) / n, p)
      pos.set([p.x, p.y, p.z, p.x, 0, p.z], i * 6)
      col.set([0.94, 0.95, 0.96, 0.002 + Math.min(1, p.y / 60) * 0.009, 0.94, 0.95, 0.96, 0], i * 8)
    }
    const idx: number[] = []
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('color', new BufferAttribute(col, 4))
    g.setIndex(idx)
    return g
  }
  const box = { min: new Vector3(Infinity, 0, Infinity), max: new Vector3(-Infinity, 0, -Infinity) }
  pts.forEach((p) => { box.min.min(p); box.max.max(p) })
  return { L, at, tangent, strip, edge, wall, box }
}

function glow() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.22, 'rgba(255,255,255,0.95)')
  r.addColorStop(0.45, 'rgba(255,255,255,0.28)'); r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r; g.fillRect(0, 0, 64, 64)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/**
 * Builds the scene into `canvas` and runs it until dispose(). `labels` holds
 * one element per braking zone (data-bz="<id>"); the scene positions them.
 * The frame-rate governor: after a 2 s warm-up, a 4 s window under 50 fps
 * turns bloom off, then one under 30 fps drops to 1×, then one under 20 fps
 * calls onLowFps (?nofallback: never).
 */
export function createScene(opts: {
  canvas: HTMLCanvasElement
  labels: HTMLElement
  recon: Recon
  clock: Clock
  bloom: boolean
  pose?: 'still'
  onFirstFrame?: () => void
  onLowFps?: () => void
}) {
  const { canvas, labels, recon, clock, pose } = opts
  const m = trackModel(recon)
  const narrow = window.innerWidth < 700
  let dpr = Math.min(window.devicePixelRatio || 1, 1.75)
  let bloomOn = opts.bloom

  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false })
  // no tone mapping: the output pass would bend the accent red to orange; colours past 1 just clip (and feed the bloom)
  renderer.toneMapping = NoToneMapping
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(C.bg)
  renderer.setPixelRatio(dpr)

  const scene = new Scene()
  scene.background = new Color(C.bg)
  scene.fog = pose === 'still' ? new Fog(C.bg, 1800, 5200) : new Fog(C.bg, 500, 2300)
  const camera = new PerspectiveCamera(pose === 'still' ? 34 : 50, 1, 2, 9000)

  // ground, grid, asphalt, wall, edges, centre line, braking zones, start line
  const cx = (m.box.min.x + m.box.max.x) / 2, cz = (m.box.min.z + m.box.max.z) / 2
  const ground = new Mesh(new PlaneGeometry(12000, 12000), new MeshBasicMaterial({ color: C.ground }))
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.2, cz)
  const grid = new GridHelper(6000, 60, '#14161c', '#0e1015'); grid.position.set(cx, -0.1, cz)
  const asphalt = new Mesh(m.strip(0, m.L, 13, 0.05), new MeshBasicMaterial({ color: C.asphalt, side: DoubleSide }))
  const wall = new Mesh(m.wall(), new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide }))
  const edgeMat = new LineBasicMaterial({ color: C.text, transparent: true, opacity: 0.13 })
  const left = new Line(m.edge(6.5), edgeMat), right = new Line(m.edge(-6.5), edgeMat)
  const centre = new Line(m.edge(0, 5), new LineDashedMaterial({ color: C.text, transparent: true, opacity: 0.22, dashSize: 10, gapSize: 14 }))
  centre.computeLineDistances()
  const red = new MeshBasicMaterial({ color: hot(C.accent, 1.15), toneMapped: false, transparent: true, opacity: 0.95 })
  const zones = recon.zones.map((z) => new Mesh(m.strip(z.from, Math.max(z.to, z.from + 8), 7, 0.25, 3), red))
  const start = new Mesh(m.strip(0, 3, 15, 0.3, 1), new MeshBasicMaterial({ color: hot(C.text, 1.2), toneMapped: false }))
  scene.add(ground, grid, asphalt, wall, left, right, ...zones, start)
  if (pose !== 'still') scene.add(centre)

  // the lap's point of light: white, red under brake
  const lightGeo = new BufferGeometry()
  lightGeo.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
  lightGeo.setAttribute('color', new Float32BufferAttribute([1, 1, 1], 3))
  const lightMat = new PointsMaterial({ size: (narrow ? 20 : 34) * dpr, sizeAttenuation: false, map: glow(), vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, blending: AdditiveBlending })
  const light = new Points(lightGeo, lightMat)
  light.frustumCulled = false
  if (pose !== 'still') scene.add(light)
  const white = hot(C.text, 2.2), brakeRed = hot(C.accent, 3)

  // post: render → (bloom) → output (tone mapping, sRGB). Always through the composer so blending happens in linear light.
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, target)
  composer.addPass(new RenderPass(scene, camera))
  const bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.85, 0.7, 0.9)
  bloomPass.enabled = bloomOn
  composer.addPass(bloomPass)
  composer.addPass(new OutputPass())

  const resize = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    composer.setPixelRatio(dpr)
    composer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    lightMat.size = (narrow ? 20 : 34) * dpr
  }
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()

  // labels: one per zone, at the zone's minimum; shown for the next 700 m (DOM labels are not hidden by hills)
  const tags = recon.zones.map((z) => ({ z, el: labels.querySelector<HTMLElement>(`[data-bz="${z.id}"]`), p: m.at(z.apex).add(new Vector3(0, 8, 0)) }))
  const proj = new Vector3()

  const look = new Vector3(), p = new Vector3(), t = new Vector3(), l = new Vector3(), want = new Vector3(), ahead = new Vector3()
  let side = 0, first = true, last = performance.now()
  const rig = (dt: number) => {
    if (pose === 'still') {
      const d = Math.max(m.box.max.x - m.box.min.x, (m.box.max.z - m.box.min.z) * 1.5)  // depth reads foreshortened: a tall circuit needs more room
      camera.position.set(cx - 0.05 * d, 0.8 * d, cz + 0.72 * d)
      camera.lookAt(cx - 30, 0, cz - 30)
      return
    }
    m.at(clock.s, p); m.tangent(clock.s, t)
    t.y = 0; t.normalize(); l.copy(t).cross(UP)
    side += ((clock.stop != null ? 1 : 0) - side) * (1 - Math.exp(-dt * 2.2))
    want.copy(p).addScaledVector(t, -85 + 30 * side).addScaledVector(l, 70 * side)
    want.y += 38 + 55 * side
    m.at(clock.s + 70 - 40 * side, ahead)
    if (first) { camera.position.copy(want); look.copy(ahead); first = false }
    camera.position.lerp(want, 1 - Math.exp(-dt * 4))
    look.lerp(ahead, 1 - Math.exp(-dt * 6))
    camera.lookAt(look)
  }

  const state: SceneState = { frames: 0, dpr, bloom: bloomOn }
  window.__pw3d = state
  const gov = { warm: 0, t0: 0, n: 0, step: 0, done: false }
  const govern = (now: number) => {
    if (gov.done) return
    if (!gov.warm) { gov.warm = now; return }
    if (now - gov.warm < 2000) return
    if (!gov.t0) { gov.t0 = now; gov.n = 0; return }
    gov.n++
    if (now - gov.t0 < 4000) return
    const fps = (gov.n * 1000) / (now - gov.t0)
    gov.t0 = now; gov.n = 0
    if (location.search.includes('nofallback')) return
    if (bloomOn && fps < 50) { bloomOn = bloomPass.enabled = state.bloom = false }
    else if (dpr > 1 && fps < 30) { dpr = state.dpr = 1; resize() }
    else if (fps < 20) { gov.done = true; opts.onLowFps?.() }
  }

  let raf = 0, running = true, firstDone = false
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    rig(dt)
    m.at(clock.s, p)
    const pa = lightGeo.attributes.position as BufferAttribute, pc = lightGeo.attributes.color as BufferAttribute
    pa.setXYZ(0, p.x, p.y + 2.5, p.z)
    const c = traceAt(recon.trace, clock.s).brake ? brakeRed : white
    pc.setXYZ(0, c.r, c.g, c.b)
    pa.needsUpdate = pc.needsUpdate = true
    const w = canvas.clientWidth, h = canvas.clientHeight
    for (const tag of tags) {
      if (!tag.el) continue
      const ahead = (((tag.z.apex - clock.s) % m.L) + m.L) % m.L
      proj.copy(tag.p).project(camera)
      const show = (pose === 'still' || ahead < 700 || ahead > m.L - 40) && proj.z < 1
      tag.el.style.opacity = show ? '1' : '0'
      if (show) tag.el.style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px) translate(-50%, -140%)`
    }
    composer.render(dt)
    state.frames++
    if (!firstDone && state.frames >= 2) { firstDone = true; opts.onFirstFrame?.() }
    govern(now)
  }
  const play = () => { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame) } }
  const pause = () => { running = false; cancelAnimationFrame(raf) }
  raf = requestAnimationFrame(frame)

  return {
    play, pause,
    dispose() {
      pause(); ro.disconnect()
      scene.traverse((o) => { const g = (o as Mesh).geometry; if (g) g.dispose() })
      composer.dispose(); target.dispose(); renderer.dispose()
    },
  }
}
