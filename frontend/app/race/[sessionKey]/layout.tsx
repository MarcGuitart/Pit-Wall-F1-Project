import type { ReactNode } from 'react'
import { publishedSessionKeys } from '@/lib/publishedKeys'

/**
 * Block 41: /race/<key> as a static shell for the published sessions. The
 * page is a client component whose server render is the same for every key
 * (the loader's first 300 ms: reserved space, no data, no time), so those
 * shells are built once and served from the CDN with no function to wake.
 * Any other key (a session opened on demand) is still rendered on request:
 * dynamicParams stays true, nothing that works today becomes a 404. The 402
 * PRO and 410 pages come from the client's /analysis and /meta calls,
 * unchanged.
 */
export const dynamicParams = true

export function generateStaticParams(): { sessionKey: string }[] {
  return publishedSessionKeys().map((k) => ({ sessionKey: String(k) }))
}

export default function RaceLayout({ children }: { children: ReactNode }) {
  return children
}
