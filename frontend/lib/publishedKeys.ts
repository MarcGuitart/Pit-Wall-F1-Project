import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Block 41: the sessions whose analysis is versioned in the repo
 * (backend/cache/<key>/_analysis.json), read at build time only. The same
 * definition as the API's /published (published at boot: on Render, the
 * repo's analyses). Netlify builds from `frontend/` with the whole repo
 * checked out, so the backend's cache is one level up. Missing directory:
 * an empty list, and the route simply stays rendered on demand.
 */
export const PUBLISHED_ROOT = process.env.PW_PUBLISHED_ROOT ?? path.join(process.cwd(), '..', 'backend', 'cache')

export function publishedSessionKeys(root: string = PUBLISHED_ROOT): number[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+$/.test(d.name) && existsSync(path.join(root, d.name, '_analysis.json')))
    .map((d) => Number(d.name))
    .sort((a, b) => a - b)
}
