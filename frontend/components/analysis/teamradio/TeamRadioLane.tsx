'use client'

import { useState } from 'react'
import type { TeamRadioAnalysis } from '@/types'
import { RadioClipPlayer } from './RadioClipPlayer'

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
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] px-4 py-3" data-testid="team-radio-lane">
      <div className="flex items-center justify-between mb-2">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Team Radio
        </span>
        <span className="font-mono text-[9px] text-text-muted">
          {radio.in_race} in race · {radio.pre_session} pre · {radio.post_session} post · F1&apos;s selection, not the full record
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(open === 'pre' ? null : 'pre')}
          disabled={!pre.length}
          className={`shrink-0 px-1.5 py-0.5 rounded-[2px] border font-display font-bold text-[8px] uppercase tracking-[0.5px] ${
            open === 'pre' ? 'border-signal-blue text-signal-blue' : 'border-border-subtle text-text-muted'
          } disabled:opacity-30`}
        >
          Pre {pre.length}
        </button>

        <div className="relative flex-1 h-[14px] bg-bg-elevated rounded-[3px]">
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
                className="absolute top-0 bottom-0 -translate-x-1/2"
                style={{ left: `${lapPct(lap, totalLaps)}%`, width: 10 }}
              >
                <span
                  className={`block mx-auto rounded-sm ${active ? 'bg-signal-blue' : 'bg-signal-blue/60 hover:bg-signal-blue'}`}
                  style={{ width: 3, height: '100%' }}
                />
                {clips.length > 1 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 font-mono text-[7px] text-signal-blue">
                    {clips.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => setOpen(open === 'post' ? null : 'post')}
          disabled={!post.length}
          className={`shrink-0 px-1.5 py-0.5 rounded-[2px] border font-display font-bold text-[8px] uppercase tracking-[0.5px] ${
            open === 'post' ? 'border-signal-blue text-signal-blue' : 'border-border-subtle text-text-muted'
          } disabled:opacity-30`}
        >
          Post {post.length}
        </button>
      </div>

      {open && openClips.length > 0 && (
        <div className="mt-2 border-t border-border-subtle pt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="font-display font-bold text-[9px] uppercase tracking-[1px] text-text-secondary">{openTitle}</span>
            <button type="button" onClick={() => setOpen(null)} className="font-mono text-[9px] text-text-muted hover:text-text-primary">
              close
            </button>
          </div>
          <div className="divide-y divide-border-subtle">
            {openClips.map((c) => (
              <RadioClipPlayer key={c.recording_url} clip={c} showDriver compact />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
