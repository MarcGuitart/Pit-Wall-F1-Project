'use client'

import { useState } from 'react'
import type { RadioClip } from '@/types/live'

type Props = {
  clips: RadioClip[]
  focusedDriver: string | null
}

/**
 * Team radio as it is published, which is not as it is broadcast.
 *
 * OpenF1's team_radio records carry a driver, a timestamp and an mp3 URL — no
 * lap number and no transcript. The lap shown is the lap the race was on when
 * the clip reached us, which is close but is not the clip's own lap, so it is
 * labelled as such rather than presented as data.
 */
export function RadioFeed({ clips, focusedDriver }: Props) {
  const [playing, setPlaying] = useState<string | null>(null)
  const shown = focusedDriver ? clips.filter((c) => c.code === focusedDriver) : clips

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Team radio
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          {shown.length} clip{shown.length === 1 ? '' : 's'}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="px-3 py-6 text-center font-mono text-[11px] text-text-muted">
          {focusedDriver ? `No radio from ${focusedDriver} yet.` : 'No radio published yet.'}
        </p>
      ) : (
        <div className="divide-y divide-border-subtle max-h-[320px] overflow-y-auto">
          {shown.map((clip, i) => {
            const id = `${clip.driver_number}-${clip.date}-${i}`
            const isPlaying = playing === id
            return (
              <div key={id} className="px-3 py-2 flex items-center gap-2.5">
                <span className="font-mono text-[9px] text-text-muted tabular-nums w-8 shrink-0">
                  {clip.lap_number != null ? `~L${clip.lap_number}` : '–'}
                </span>
                <span className="font-display font-bold text-[12px] tracking-[0.5px] text-text-primary w-10 shrink-0">
                  {clip.code}
                </span>
                <span className="font-mono text-[10px] text-text-muted tabular-nums flex-1 truncate">
                  {clip.date ? clip.date.slice(11, 19) : ''}
                </span>
                {clip.recording_url ? (
                  <button
                    onClick={() => setPlaying(isPlaying ? null : id)}
                    className={[
                      'shrink-0 px-2 py-0.5 border rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.8px] transition-colors',
                      isPlaying
                        ? 'border-signal-green/50 text-signal-green bg-signal-green/10'
                        : 'border-border-default text-text-secondary hover:text-text-primary',
                    ].join(' ')}
                  >
                    {isPlaying ? 'stop' : 'play'}
                  </button>
                ) : (
                  <span className="font-mono text-[9px] text-text-muted shrink-0">no audio</span>
                )}
                {isPlaying && clip.recording_url && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <audio
                    src={clip.recording_url}
                    autoPlay
                    onEnded={() => setPlaying(null)}
                    className="hidden"
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="px-3 py-1.5 border-t border-border-subtle">
        <p className="font-mono text-[9px] text-text-muted leading-relaxed">
          Lap is approximate — OpenF1 publishes a timestamp and an audio URL, not a lap number or a
          transcript.
        </p>
      </div>
    </div>
  )
}
