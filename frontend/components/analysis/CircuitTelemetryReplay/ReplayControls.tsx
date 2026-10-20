'use client'

import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { buttonClass } from '@/components/ui'
import t from './telemetry.module.css'

const SPEEDS = [0.5, 1, 2, 4] as const
type PlaybackSpeed = typeof SPEEDS[number]

type Props = {
  playing: boolean
  progress: number     // 0..1
  lapTime: number      // seconds, for time display
  playbackSpeed: PlaybackSpeed
  onPlayPause: () => void
  onScrub: (progress: number) => void
  onSpeedChange: (speed: PlaybackSpeed) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

export function ReplayControls({
  playing,
  progress,
  lapTime,
  playbackSpeed,
  onPlayPause,
  onScrub,
  onSpeedChange,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null)

  const computeProgress = useCallback((clientX: number) => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const clamped = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onScrub(clamped)
  }, [onScrub])

  // Drag with mouse, pen or touch
  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    computeProgress(e.clientX)
  }
  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) computeProgress(e.clientX)
  }

  // …and with the keyboard: arrows step 1 %, Page keys 10 %, Home/End the ends
  const handleKey = (e: KeyboardEvent) => {
    const step = { ArrowRight: 0.01, ArrowUp: 0.01, ArrowLeft: -0.01, ArrowDown: -0.01, PageUp: 0.1, PageDown: -0.1 }[e.key]
    if (step != null) { e.preventDefault(); onScrub(Math.max(0, Math.min(1, progress + step))) }
    else if (e.key === 'Home') { e.preventDefault(); onScrub(0) }
    else if (e.key === 'End') { e.preventDefault(); onScrub(1) }
  }

  const elapsed = progress * lapTime
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(playbackSpeed) + 1) % SPEEDS.length]

  return (
    <div className={t.player}>
      {/* Play / Pause */}
      <button type="button" onClick={onPlayPause} className={t.play} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '‖' : '►'}
      </button>

      {/* Scrub track */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Lap position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={`${formatTime(elapsed)} of ${formatTime(lapTime)}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onKeyDown={handleKey}
        className={t.scrub}
      >
        <span className={t.scrubFill} style={{ width: `${progress * 100}%` }} />
        <span className={t.scrubThumb} style={{ left: `${progress * 100}%` }} />
      </div>

      {/* Time */}
      <span className={t.time}>{formatTime(elapsed)} / {formatTime(lapTime)}</span>

      {/* Speed toggle */}
      <button type="button" onClick={() => onSpeedChange(nextSpeed)} className={buttonClass()} aria-label={`Playback speed ${playbackSpeed}×, change to ${nextSpeed}×`}>
        {playbackSpeed}×
      </button>
    </div>
  )
}
