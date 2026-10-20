/**
 * next/font/google only exists inside Next's compiler. Under vitest every
 * font loader returns the shape a component reads (className, variable,
 * style), so a component that renders the design system's root can be tested.
 */
type FontResult = { className: string; variable: string; style: { fontFamily: string } }
const loader = (): FontResult => ({ className: '', variable: '', style: { fontFamily: 'sans-serif' } })
const fonts: Record<string, typeof loader> = new Proxy({}, { get: () => loader })
export default fonts
export const Archivo = loader
export const Barlow = loader
export const Barlow_Condensed = loader
export const JetBrains_Mono = loader
