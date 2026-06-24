'use client'

import { useCallback, useRef } from 'react'

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
  const dragging = useRef(false)

  const computeProgress = useCallback((clientX: number) => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const clamped = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onScrub(clamped)
  }, [onScrub])

  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    computeProgress(e.clientX)
    const onMove = (ev: MouseEvent) => { if (dragging.current) computeProgress(ev.clientX) }
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const elapsed = progress * lapTime
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(playbackSpeed) + 1) % SPEEDS.length]

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-bg-primary/90 border border-border-subtle rounded-[4px] backdrop-blur-sm">
      {/* Play / Pause */}
      <button
        onClick={onPlayPause}
        className="w-7 h-7 flex items-center justify-center rounded-full bg-signal-red text-white text-[10px] font-bold shrink-0 hover:bg-red-600 transition-colors"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? '⏸' : '▶'}
      </button>

      {/* Scrub track */}
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        className="relative flex-1 h-[2px] bg-border-default rounded-full cursor-pointer"
        style={{ minWidth: 100 }}
      >
        <div
          className="absolute top-0 left-0 h-full bg-signal-red rounded-full"
          style={{ width: `${progress * 100}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-signal-red shadow-sm"
          style={{ left: `calc(${progress * 100}% - 4px)` }}
        />
      </div>

      {/* Time */}
      <span className="font-mono text-[10px] text-text-secondary tabular-nums shrink-0">
        {formatTime(elapsed)} / {formatTime(lapTime)}
      </span>

      {/* Speed toggle */}
      <button
        onClick={() => onSpeedChange(nextSpeed)}
        className="px-2 py-0.5 rounded-[3px] border border-border-subtle text-text-muted font-mono text-[9px] hover:border-border-default hover:text-text-secondary transition-all shrink-0"
      >
        {playbackSpeed}×
      </button>
    </div>
  )
}
