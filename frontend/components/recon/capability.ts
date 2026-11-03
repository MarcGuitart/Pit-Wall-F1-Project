/**
 * What the Recon Lap can afford on this device, decided before three.js loads.
 *
 *   still   the image and the table instead of the scene: data saver, 2G/3G,
 *           a small low-end phone, no WebGL. Reduced motion is not one of them:
 *           the zone tour never moves by itself (the lap plays only when asked)
 *           and the camera cuts instead of flying; see ReconView.
 *   bloom   off on a phone and on GPUs known to be weak (software renderers,
 *           integrated Intel HD/UHD, older Mali/Adreno/PowerVR)
 *
 * ?still=1 forces the still, ?force3d=1 the scene, ?bloom=0|1 the glow (captures, measurements).
 */
export type StillReason = 'slow-device' | 'save-data' | 'no-webgl' | 'forced' | 'low-fps'

type Nav = Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number }

export const WEAK_GPU = /SwiftShader|llvmpipe|Software|Intel\(R\) (HD|UHD) Graphics|Intel HD|Mali-[GT]?[0-7]\d?\b|Adreno \(TM\) [3-5]\d\d|PowerVR/i

export function stillReason(): StillReason | null {
  if (typeof window === 'undefined') return null
  const q = new URLSearchParams(window.location.search)
  if (q.has('still')) return 'forced'
  if (q.has('force3d')) return null
  const nav = navigator as Nav
  if (nav.connection?.saveData) return 'save-data'
  if (/(^|-)2g$|^3g$/.test(nav.connection?.effectiveType ?? '')) return 'slow-device'
  const phone = window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 768
  if (phone && ((nav.deviceMemory ?? 8) < 4 || (navigator.hardwareConcurrency ?? 8) <= 4)) return 'slow-device'
  return gpuName() === null ? 'no-webgl' : null
}

let gpu: string | null | undefined
/** The unmasked renderer string, '' when hidden, null without WebGL. */
export function gpuName(): string | null {
  if (gpu !== undefined) return gpu
  try {
    const gl = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null
    if (!gl) return (gpu = null)
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  } catch { gpu = null }
  return gpu
}

export function wantsBloom(): boolean {
  const q = new URLSearchParams(window.location.search).get('bloom')
  if (q === '0' || q === '1') return q === '1'
  if (window.matchMedia('(pointer: coarse)').matches) return false
  return !WEAK_GPU.test(gpuName() ?? '')
}

export const STILL_COPY: Record<StillReason, string> = {
  'slow-device': 'Still image: this device or connection is slow for the 3D view.',
  'save-data': 'Still image: data saver is on.',
  'no-webgl': 'Still image: WebGL is not available here.',
  forced: 'Still image (forced with ?still=1).',
  'low-fps': 'Still image: the 3D view ran below 20 fps here, so it stopped.',
}
