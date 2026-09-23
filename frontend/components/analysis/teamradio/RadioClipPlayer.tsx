'use client'

import { useEffect, useRef, useState } from 'react'
import type { TeamRadioClip } from '@/types'
import { claimAudio, releaseAudio } from '@/lib/audioBus'

type State = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

type Props = {
  clip: TeamRadioClip
  /** Show the driver code in the row (timeline lane); hidden in the driver panel. */
  showDriver?: boolean
  compact?: boolean
}

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return '–:––'
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${r.toString().padStart(2, '0')}`
}

function clockUtc(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}:${d.getUTCSeconds().toString().padStart(2, '0')}Z`
}

/**
 * Native <audio> behind a small custom UI: play/pause, progress, time.
 * preload="metadata" only; no download control (controlsList is not enough,
 * so no native controls at all). A file the CDN no longer serves is an
 * explicit "Recording unavailable" state, not a dead button.
 */
export function RadioClipPlayer({ clip, showDriver = false, compact = false }: Props) {
  const ref = useRef<HTMLAudioElement>(null)
  const [state, setState] = useState<State>('idle')
  const [duration, setDuration] = useState<number>(NaN)
  const [time, setTime] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onMeta = () => setDuration(el.duration)
    const onTime = () => setTime(el.currentTime)
    const onPlaying = () => setState('playing')
    const onPause = () => setState((s) => (s === 'ended' || s === 'error' ? s : 'paused'))
    const onEnded = () => setState('ended')
    const onWaiting = () => setState((s) => (s === 'playing' ? 'loading' : s))
    const onError = () => setState('error')
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('playing', onPlaying)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    el.addEventListener('waiting', onWaiting)
    el.addEventListener('error', onError)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('playing', onPlaying)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('waiting', onWaiting)
      el.removeEventListener('error', onError)
      releaseAudio(el)
    }
  }, [])

  const toggle = async () => {
    const el = ref.current
    if (!el || state === 'error') return
    if (state === 'playing') {
      el.pause()
      return
    }
    setState('loading')
    claimAudio(el)
    try {
      await el.play()
    } catch {
      // play() rejects on a network/format failure before the 'error' event in some browsers
      setState('error')
    }
  }

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = ref.current
    if (!el || !isFinite(duration)) return
    el.currentTime = Number(e.target.value)
    setTime(el.currentTime)
  }

  const unavailable = state === 'error'
  const label = clip.lap_number != null ? `L${clip.lap_number}` : clip.phase === 'pre' ? 'PRE' : 'POST'

  return (
    <div
      className={`flex items-center gap-2 ${compact ? 'py-1' : 'py-1.5'} ${unavailable ? 'opacity-70' : ''}`}
      data-testid="radio-clip"
    >
      <audio ref={ref} src={clip.recording_url} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        disabled={unavailable}
        aria-label={unavailable ? 'Recording unavailable' : state === 'playing' ? 'Pause' : 'Play'}
        className={`w-6 h-6 shrink-0 rounded-[3px] border flex items-center justify-center font-mono text-[10px] transition-colors ${
          unavailable
            ? 'border-signal-red/40 text-signal-red cursor-not-allowed'
            : 'border-border-default text-text-secondary hover:border-signal-green hover:text-signal-green'
        }`}
      >
        {unavailable ? '✕' : state === 'loading' ? '…' : state === 'playing' ? '❚❚' : '▶'}
      </button>
      <span className="font-display font-bold text-[9px] uppercase tracking-[0.5px] text-text-muted w-9 shrink-0">
        {label}
      </span>
      {showDriver && (
        <span className="font-display font-bold text-[10px] uppercase text-text-primary w-8 shrink-0">
          {clip.driver_code}
        </span>
      )}
      {unavailable ? (
        <span className="font-mono text-[10px] text-signal-red">
          Recording unavailable — the F1 archive no longer serves this file.
        </span>
      ) : (
        <>
          <input
            type="range"
            min={0}
            max={isFinite(duration) ? duration : 0}
            step={0.1}
            value={Math.min(time, isFinite(duration) ? duration : 0)}
            onChange={seek}
            disabled={!isFinite(duration)}
            aria-label="Seek"
            className="flex-1 h-1 accent-signal-green min-w-[60px]"
          />
          <span className="font-mono text-[9px] text-text-muted tabular-nums w-[70px] text-right shrink-0">
            {fmt(time)} / {fmt(duration)}
          </span>
        </>
      )}
      <span className="font-mono text-[8px] text-text-muted shrink-0" title="Broadcast time (UTC)">
        {clockUtc(clip.date)}
      </span>
    </div>
  )
}
