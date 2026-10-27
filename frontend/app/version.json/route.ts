import { buildInfo } from '@/lib/build'

// Built once, served as a static file: /version.json says which commit is live.
export const dynamic = 'force-static'

export function GET() {
  return Response.json(buildInfo(), { headers: { 'Cache-Control': 'no-cache' } })
}
