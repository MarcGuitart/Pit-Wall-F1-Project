import type { Metadata } from 'next'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { RECONS } from '@/lib/recon'
import { displayNameOf } from '@/lib/displayName'
import { lapClock, type Recon } from '@/components/recon/data'
import { ReconView } from '@/components/recon/ReconView'

// Only the published circuits exist; anything else is a 404.
export const dynamicParams = false
export function generateStaticParams() {
  return RECONS.map((r) => ({ circuit: r.slug }))
}

function read(slug: string): Recon | null {
  if (!RECONS.some((r) => r.slug === slug)) return null
  return JSON.parse(readFileSync(join(process.cwd(), 'public', 'recon', `${slug}.json`), 'utf8')) as Recon
}

export function generateMetadata({ params }: { params: { circuit: string } }): Metadata {
  const r = read(params.circuit)
  if (!r) return {}
  const title = `Recon Lap · ${displayNameOf(r) ?? r.circuit} ${r.for_year} · Pit Wall Engineer`
  const description = `${r.circuit} in 3D from the ${r.year} pole lap (${r.lap.driver}, ${lapClock(r.lap.time)}): its real height, ${r.zones.length} braking zones with the speed lost, minimum speed and gear. Recorded data, OpenF1.`
  return { title, description, alternates: { canonical: `https://pitwallengineer.com/recon/${r.slug}` }, openGraph: { title, description } }
}

/**
 * /recon/<circuit> (block 52, prototype A in production): the circuit in 3D
 * from the previous season's pole lap, playing by itself and holding at every
 * braking zone. The data is read at build time, so the page and its table are
 * static HTML; three.js arrives after, on demand.
 */
export default function ReconPage({ params }: { params: { circuit: string } }) {
  const r = read(params.circuit)
  if (!r) notFound()
  return (
    <AppShell breadcrumb={[{ label: 'Races', href: '/races' }, { label: `${displayNameOf(r) ?? r.circuit} ${r.for_year}` }, { label: 'Recon Lap' }]}>
      <ReconView recon={r} />
    </AppShell>
  )
}
