'use client'

import { useState } from 'react'
import type { TeamRadioAnalysis } from '@/types'
import { RadioClipPlayer } from './RadioClipPlayer'
import { Panel, buttonClass, ui } from '@/components/ui'
import rc from './radio.module.css'

type Props = {
  radio: TeamRadioAnalysis
  totalLaps: number
}

function lapPct(lap: number, total: number) {
  return Math.min((lap / total) * 100, 100)
}

/**
 * Team-radio lane under the race timeline: one marker per lap that has clips
 * (several clips on the same lap are one marker with a count), plus PRE /
 * POST groups at the ends. Clicking a marker opens the clips inline.
 * Rendered only when the session has at least one clip — no lane otherwise.
 */
export function TeamRadioLane({ radio, totalLaps }: Props) {
  const [open, setOpen] = useState<string | null>(null)   // "lap:28" | "pre" | "post"

  if (!radio.clips.length || totalLaps < 2) return null

  const byLap = new Map<number, typeof radio.clips>()
  for (const c of radio.clips) {
    if (c.phase === 'race' && c.lap_number != null) {
      byLap.set(c.lap_number, [...(byLap.get(c.lap_number) ?? []), c])
    }
  }
  const pre = radio.clips.filter((c) => c.phase === 'pre')
  const post = radio.clips.filter((c) => c.phase === 'post')
  const laps = Array.from(byLap.keys()).sort((a, b) => a - b)

  const openClips =
    open === 'pre' ? pre : open === 'post' ? post : open?.startsWith('lap:') ? byLap.get(Number(open.slice(4))) ?? [] : []
  const openTitle =
    open === 'pre' ? `Pre-session · ${pre.length} clip${pre.length === 1 ? '' : 's'}`
    : open === 'post' ? `Post-session · ${post.length} clip${post.length === 1 ? '' : 's'}`
    : open ? `Lap ${open.slice(4)} · ${openClips.length} clip${openClips.length === 1 ? '' : 's'}`
    : ''

  return (
    <div data-testid="team-radio-lane">
      <Panel
        title="Team Radio"
        aside={<>{radio.in_race} in race · {radio.pre_session} pre · {radio.post_session} post · F1&apos;s selection, not the full record</>}
      >
        <div className={rc.lane}>
          <button
            type="button"
            onClick={() => setOpen(open === 'pre' ? null : 'pre')}
            disabled={!pre.length}
            aria-expanded={open === 'pre'}
            className={buttonClass()}
            style={open === 'pre' ? { borderColor: 'var(--pw-blue)', color: 'var(--pw-blue)' } : undefined}
          >
            Pre {pre.length}
          </button>

          <div className={rc.track}>
            {laps.map((lap) => {
              const clips = byLap.get(lap)!
              const key = `lap:${lap}`
              const active = open === key
              return (
                <button
                  key={lap}
                  type="button"
                  onClick={() => setOpen(active ? null : key)}
                  title={`Lap ${lap}: ${clips.map((c) => c.driver_code).join(', ')}`}
                  aria-label={`Lap ${lap}, ${clips.length} radio clip${clips.length === 1 ? '' : 's'}`}
                  aria-expanded={active}
                  className={`${rc.mark} ${active ? rc.markOn : ''}`}
                  style={{ left: `${lapPct(lap, totalLaps)}%` }}
                >
                  <span />
                  {clips.length > 1 && <i>{clips.length}</i>}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => setOpen(open === 'post' ? null : 'post')}
            disabled={!post.length}
            aria-expanded={open === 'post'}
            className={buttonClass()}
            style={open === 'post' ? { borderColor: 'var(--pw-blue)', color: 'var(--pw-blue)' } : undefined}
          >
            Post {post.length}
          </button>
        </div>

        {open && openClips.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--pw-divider)' }}>
            <div className={rc.openHead}>
              <span className={ui.label} style={{ color: 'var(--pw-text)', fontWeight: 800 }}>{openTitle}</span>
              <button type="button" onClick={() => setOpen(null)} className={buttonClass('ghost')}>close</button>
            </div>
            <div className={rc.clips}>
              {openClips.map((c) => (
                <RadioClipPlayer key={c.recording_url} clip={c} showDriver compact />
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}
