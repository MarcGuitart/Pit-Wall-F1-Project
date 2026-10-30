/**
 * next/font/local only exists inside Next's compiler (lib/fonts.ts, block 52b).
 * Under vitest the loader returns the shape a component reads, like
 * test/next-font-stub.ts does for next/font/google.
 */
type FontResult = { className: string; variable: string; style: { fontFamily: string } }
export default function localFont(): FontResult {
  return { className: '', variable: '', style: { fontFamily: 'sans-serif' } }
}
