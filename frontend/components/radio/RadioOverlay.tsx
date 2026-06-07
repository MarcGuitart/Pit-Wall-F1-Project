'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { FullRaceAnalysis } from '@/types'
import { sendToEngineer, fetchChatHealth } from '@/lib/api'
import { useRaceStore } from '@/stores/raceStore'
import { playRadioOpen, playRadioClose, playMessageReceived } from '@/lib/audio/radioFx'
import { AudioToggle } from './AudioToggle'
import { EngineerOfflineState } from './EngineerOfflineState'
import { generateSuggestedQuestions } from '@/lib/chat/suggestedQuestions'

type Message = {
  role: 'engineer' | 'user'
  content: string
}

type OllamaStatus = 'checking' | 'online' | 'offline'

type Props = {
  analysis: FullRaceAnalysis
  onClose: () => void
}

const NUM_BARS = 35

function WaveformBars({ active }: { active: boolean }) {
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: NUM_BARS }, () => 3)
  )

  useEffect(() => {
    if (!active) {
      setHeights(Array.from({ length: NUM_BARS }, () => 3))
      return
    }
    const id = setInterval(() => {
      setHeights(Array.from({ length: NUM_BARS }, () => Math.random() * 40 + 4))
    }, 160)
    return () => clearInterval(id)
  }, [active])

  return (
    <div className="flex items-end gap-[2px] h-12">
      {heights.map((h, i) => (
        <div
          key={i}
          className="rounded-sm transition-all duration-150"
          style={{
            width: '3px',
            height: `${h}px`,
            backgroundColor: active
              ? `rgba(35, 209, 139, ${0.4 + (h / 44) * 0.6})`
              : 'rgba(35, 209, 139, 0.2)',
          }}
        />
      ))}
    </div>
  )
}

export function RadioOverlay({ analysis, onClose }: Props) {
  const [phase, setPhase] = useState<'opening' | 'chat'>('opening')
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>('checking')
  const [showOffline, setShowOffline] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { focusedDriver } = useRaceStore()

  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(() =>
    generateSuggestedQuestions(analysis, focusedDriver)
  )

  // Re-generate when focusedDriver changes while overlay is open
  useEffect(() => {
    setSuggestedQuestions(generateSuggestedQuestions(analysis, focusedDriver))
  }, [focusedDriver, analysis])

  // Play open sound on mount (user has just clicked — autoplay compliant)
  useEffect(() => {
    playRadioOpen()
  }, [])

  // Check Ollama health on open
  useEffect(() => {
    let cancelled = false
    fetchChatHealth()
      .then((health) => {
        if (cancelled) return
        setOllamaStatus(health.ollama_reachable ? 'online' : 'offline')
      })
      .catch(() => {
        if (!cancelled) setOllamaStatus('offline')
      })
    return () => { cancelled = true }
  }, [])

  // Opening animation: 2.1s then transition to chat
  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase('chat')
      if (ollamaStatus === 'offline') setShowOffline(true)
    }, 2100)
    return () => clearTimeout(timer)
  }, [ollamaStatus])

  // After animation, react to late-resolving status
  useEffect(() => {
    if (phase !== 'chat') return
    if (ollamaStatus === 'offline') setShowOffline(true)
    if (ollamaStatus === 'online') setShowOffline(false)
  }, [phase, ollamaStatus])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleClose = useCallback(() => {
    playRadioClose()
    onClose()
  }, [onClose])

  const checkConnection = useCallback(async () => {
    setOllamaStatus('checking')
    try {
      const health = await fetchChatHealth()
      if (health.ollama_reachable) {
        setOllamaStatus('online')
        setShowOffline(false)
      } else {
        setOllamaStatus('offline')
      }
    } catch {
      setOllamaStatus('offline')
    }
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isSending) return
      const question = text.trim()
      setInput('')
      setMessages((prev) => [...prev, { role: 'user', content: question }])
      setIsSending(true)
      try {
        const res = await sendToEngineer({
          session_key: analysis.race.session_key,
          question,
          focused_driver: focusedDriver?.code ?? null,
        })
        setMessages((prev) => [...prev, { role: 'engineer', content: res.answer }])
        playMessageReceived()
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'engineer', content: 'Comms interference. Unable to reach pit wall. Try again.' },
        ])
      } finally {
        setIsSending(false)
      }
    },
    [analysis, isSending, focusedDriver]
  )

  // Opening line varies when a driver is focused
  const channelLine = focusedDriver
    ? `Pit wall comms · ${focusedDriver.code} focus`
    : `Pit wall comms · channel ${analysis.race.session_key}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={handleClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-2xl bg-bg-secondary border border-border-default rounded-t-[4px] overflow-hidden shadow-2xl"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* === OPENING PHASE === */}
        {phase === 'opening' && (
          <div className="flex flex-col items-center justify-center px-8 py-10 gap-6 min-h-[320px]">
            <div className="font-mono text-[10px] text-text-muted tracking-[2px]">
              {channelLine}
            </div>
            <div className="text-center">
              <span className="font-display font-black text-[36px] uppercase tracking-[-0.5px] text-text-primary">
                Race{' '}
              </span>
              <span className="font-display font-black text-[36px] uppercase tracking-[-0.5px] text-signal-red">
                Engineer
              </span>
            </div>
            <WaveformBars active={true} />
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
              <span className="font-mono text-[11px] text-text-secondary">
                {ollamaStatus === 'checking'
                  ? 'Checking engineer connection…'
                  : 'Establishing session context…'}
              </span>
            </div>
          </div>
        )}

        {/* === CHAT PHASE — OFFLINE === */}
        {phase === 'chat' && showOffline && (
          <div className="relative">
            <EngineerOfflineState
              onCheckConnection={checkConnection}
              onContinueAnyway={() => setShowOffline(false)}
            />
          </div>
        )}

        {/* === CHAT PHASE — CHAT UI === */}
        {phase === 'chat' && !showOffline && (
          <div className="flex flex-col" style={{ maxHeight: '85vh' }}>
            {/* Header */}
            <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-[3px] bg-signal-green/20 border border-signal-green/40 flex items-center justify-center">
                  <span className="font-display font-bold text-[9px] text-signal-green">ENG</span>
                </div>
                <div>
                  <div className="font-display font-bold text-[12px] uppercase tracking-[0.5px] text-text-primary">
                    Race Wall Engineer
                  </div>
                  <div className="font-mono text-[9px] text-text-muted">
                    {analysis.race.meeting_name} · {analysis.race.session_name}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <AudioToggle />
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
                  <span className="font-display font-bold text-[9px] uppercase tracking-[1px] text-signal-green">
                    On air
                  </span>
                </div>
                <button
                  onClick={handleClose}
                  className="w-6 h-6 flex items-center justify-center rounded-[2px] hover:bg-bg-elevated text-text-muted hover:text-text-primary font-mono text-[14px] transition-colors"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Context pills */}
            <div className="px-4 py-2 border-b border-border-subtle flex items-center gap-2 flex-wrap shrink-0 bg-bg-panel">
              <span className="flex items-center gap-1.5 px-2 py-1 bg-signal-red/10 border border-signal-red/30 rounded-[2px]">
                <span className="font-mono font-bold text-[10px] text-signal-red">
                  CHAOS {analysis.chaos.score}
                </span>
              </span>
              <span className="flex items-center gap-1.5 px-2 py-1 bg-bg-elevated border border-border-subtle rounded-[2px]">
                <span className="font-mono text-[10px] text-text-secondary">
                  {analysis.tyre_degradation.length} stints loaded
                </span>
              </span>
              {/* Focused driver pill */}
              {focusedDriver && (
                <span className="flex items-center gap-1 px-2 py-1 bg-signal-blue/10 border border-signal-blue/30 rounded-[2px]">
                  <span className="font-mono font-bold text-[10px] text-signal-blue">
                    {focusedDriver.code} focus
                  </span>
                </span>
              )}
              {[
                { label: 'Tyres loaded' },
                { label: 'Pit mapped' },
                { label: 'Race ctrl parsed' },
              ].map(({ label }) => (
                <span
                  key={label}
                  className="flex items-center gap-1 px-2 py-1 bg-signal-green/10 border border-signal-green/30 rounded-[2px]"
                >
                  <span className="w-1 h-1 rounded-full bg-signal-green" />
                  <span className="font-mono text-[10px] text-signal-green">{label}</span>
                </span>
              ))}
            </div>

            {/* Message feed */}
            <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[160px]">
              {messages.length === 0 && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-[2px] bg-signal-green/20 border border-signal-green/40 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="font-display font-bold text-[7px] text-signal-green">ENG</span>
                  </div>
                  <div className="flex-1 bg-bg-panel border-l-2 border-l-signal-green px-3 py-2 rounded-r-[3px]">
                    <div className="font-display font-bold text-[9px] uppercase tracking-[1px] text-signal-green mb-1">
                      Race Engineer
                    </div>
                    <p className="font-mono text-[11px] text-text-secondary leading-relaxed">
                      Ready. I have full context for{' '}
                      <span className="text-text-primary">{analysis.race.meeting_name}</span> —
                      chaos score {analysis.chaos.score}, {analysis.true_pace.length} drivers
                      analysed, {analysis.tyre_degradation.length} stints mapped.
                      {focusedDriver && (
                        <> Focused on <span className="text-signal-blue">{focusedDriver.code}</span>.</>
                      )}{' '}
                      Ask me anything about race strategy.
                    </p>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div
                    className={`w-6 h-6 rounded-[2px] flex items-center justify-center shrink-0 mt-0.5 ${
                      msg.role === 'engineer'
                        ? 'bg-signal-green/20 border border-signal-green/40'
                        : 'bg-signal-red/20 border border-signal-red/40'
                    }`}
                  >
                    <span className={`font-display font-bold text-[7px] ${msg.role === 'engineer' ? 'text-signal-green' : 'text-signal-red'}`}>
                      {msg.role === 'engineer' ? 'ENG' : 'YOU'}
                    </span>
                  </div>
                  <div
                    className={`flex-1 px-3 py-2 rounded-r-[3px] ${
                      msg.role === 'engineer'
                        ? 'bg-bg-panel border-l-2 border-l-signal-green'
                        : 'bg-signal-red/10 border-l-2 border-l-signal-red'
                    }`}
                  >
                    <div className={`font-display font-bold text-[9px] uppercase tracking-[1px] mb-1 ${msg.role === 'engineer' ? 'text-signal-green' : 'text-signal-red'}`}>
                      {msg.role === 'engineer' ? 'Race Engineer' : 'You'}
                    </div>
                    <p className="font-mono text-[11px] text-text-secondary leading-relaxed">
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}

              {isSending && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-[2px] bg-signal-green/20 border border-signal-green/40 flex items-center justify-center shrink-0">
                    <span className="font-display font-bold text-[7px] text-signal-green">ENG</span>
                  </div>
                  <div className="bg-bg-panel border-l-2 border-l-signal-green px-3 py-2 rounded-r-[3px]">
                    <div className="flex gap-1 items-center h-5">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-signal-green animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Suggested questions */}
            {messages.length === 0 && (
              <div className="px-4 pb-3 grid grid-cols-2 gap-2 shrink-0">
                {suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-left px-3 py-2 bg-bg-panel border-l-2 border-l-signal-purple hover:bg-bg-elevated transition-colors rounded-r-[2px]"
                  >
                    <p className="font-mono text-[10px] text-text-secondary leading-snug">{q}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Composer */}
            <div className="px-4 py-3 border-t border-border-subtle shrink-0">
              <div className="flex gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage(input)
                    }
                  }}
                  placeholder="Ask about strategy, tyres, pit timing…"
                  rows={2}
                  className="flex-1 bg-bg-elevated border border-border-default rounded-[3px] px-3 py-2 font-mono text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-signal-blue resize-none"
                  disabled={isSending}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isSending}
                  className="px-4 py-2 bg-signal-red hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-display font-bold text-[10px] uppercase tracking-[1px] rounded-[3px] transition-all shrink-0"
                >
                  Send
                </button>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="font-mono text-[9px] text-text-muted">
                  Grounded mode · answers cite session signals
                </span>
                <span className="font-mono text-[9px] text-text-muted">Shift+Enter newline</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
