'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { FullRaceAnalysis } from '@/types'
import { sendToEngineer, fetchChatHealth } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { useRaceStore } from '@/stores/raceStore'
import { playRadioOpen, playRadioClose, playMessageReceived } from '@/lib/audio/radioFx'
import { AudioToggle } from './AudioToggle'
import { EngineerOfflineState } from './EngineerOfflineState'
import { generateSuggestedQuestions } from '@/lib/chat/suggestedQuestions'
import { contextPills } from '@/lib/chat/contextPills'
import { engineerStatus } from '@/lib/chat/engineerStatus'
import { Badge, ConfidenceBadge, buttonClass, ui } from '@/components/ui'
import r from './radio.module.css'

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s ? `${m}m ${s}s` : `${m}m`
}

type Message = {
  role: 'engineer' | 'user'
  /** Structural confidence from /chat (model declaration capped by validated citations). */
  confidence?: string | null
  /** Engineer notes the answer is grounded on, validated server-side. */
  cited?: { id: string; lap_number: number | null; title: string }[]
  content: string
}

type EngineerConnection = 'checking' | 'online' | 'offline'

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
    <div className={r.wave} aria-hidden="true">
      {heights.map((h, i) => (
        <span key={i} style={{ height: `${h}px`, opacity: active ? 0.4 + (h / 44) * 0.6 : 0.2 }} />
      ))}
    </div>
  )
}

export function RadioOverlay({ analysis, onClose }: Props) {
  const [phase, setPhase] = useState<'opening' | 'chat'>('opening')
  const [connection, setConnection] = useState<EngineerConnection>('checking')
  const [showOffline, setShowOffline] = useState(false)
  const [offlineReason, setOfflineReason] = useState<'server' | 'model'>('model')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  // Epoch ms until which /chat is rate-limited for this client (0 = not limited)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [cooldownLeft, setCooldownLeft] = useState(0)
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

  // Check the engineer (/chat/health) on open
  useEffect(() => {
    let cancelled = false
    fetchChatHealth()
      .then((health) => {
        if (cancelled) return
        const st = engineerStatus(health)
        if (!st.online) setOfflineReason(st.reason)
        setConnection(st.online ? 'online' : 'offline')
      })
      .catch(() => {
        if (cancelled) return
        setOfflineReason('server')
        setConnection('offline')
      })
    return () => { cancelled = true }
  }, [])

  // Opening animation: 1.2s then transition to chat
  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase('chat')
      if (connection === 'offline') setShowOffline(true)
    }, 1200)
    return () => clearTimeout(timer)
  }, [connection])

  // After animation, react to late-resolving status
  useEffect(() => {
    if (phase !== 'chat') return
    if (connection === 'offline') setShowOffline(true)
    if (connection === 'online') setShowOffline(false)
  }, [phase, connection])

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
    setConnection('checking')
    try {
      // Same rule as on open (ai_ready): this used ollama_reachable, so a
      // deployment answering through another provider never came back online.
      const st = engineerStatus(await fetchChatHealth())
      if (st.online) {
        setConnection('online')
        setShowOffline(false)
      } else {
        setOfflineReason(st.reason)
        setConnection('offline')
      }
    } catch {
      setOfflineReason('server')
      setConnection('offline')
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
        setMessages((prev) => [
          ...prev,
          { role: 'engineer', content: res.answer, confidence: res.confidence ?? null, cited: res.cited_signals ?? [] },
        ])
        playMessageReceived()
      } catch (err) {
        let content = 'Comms interference. Unable to reach pit wall. Try again.'
        if (err instanceof ApiError) {
          content = err.message
          if (err.code === 'RATE_LIMITED') {
            const secs = Number(err.details?.retry_after_seconds ?? 60)
            setCooldownUntil(Date.now() + secs * 1000)
            content = `Radio silence: message limit reached. Channel reopens in ${formatWait(secs)}.`
          }
        }
        setMessages((prev) => [...prev, { role: 'engineer', content }])
      } finally {
        setIsSending(false)
      }
    },
    [analysis, isSending, focusedDriver]
  )

  // Tick the rate-limit countdown once a second while it is active
  useEffect(() => {
    if (!cooldownUntil) return
    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
      setCooldownLeft(left)
      if (left === 0) setCooldownUntil(0)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [cooldownUntil])
  const rateLimited = cooldownUntil > 0 && cooldownLeft > 0

  // Opening line varies when a driver is focused
  const channelLine = focusedDriver
    ? `Pit wall comms · ${focusedDriver.code} focus`
    : `Pit wall comms · channel ${analysis.race.session_key}`

  return (
    <div className={r.backdrop} onClick={handleClose}>
      <div
        className={r.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Race engineer"
        onClick={(e) => e.stopPropagation()}
      >
        {/* === OPENING PHASE === */}
        {phase === 'opening' && (
          <div className={r.opening}>
            <div className={ui.label}>{channelLine}</div>
            <div className={r.openTitle}>
              Race{' '}<span className={ui.accent}>Engineer</span>
            </div>
            <WaveformBars active={true} />
            <div className={ui.sub} role="status">
              {connection === 'checking'
                ? 'Checking engineer connection…'
                : 'Establishing session context…'}
            </div>
          </div>
        )}

        {/* === CHAT PHASE — OFFLINE === */}
        {phase === 'chat' && showOffline && (
          <EngineerOfflineState
            reason={offlineReason}
            onCheckConnection={checkConnection}
            onContinueAnyway={() => setShowOffline(false)}
          />
        )}

        {/* === CHAT PHASE — CHAT UI === */}
        {phase === 'chat' && !showOffline && (
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh', minHeight: 0 }}>
            {/* Header */}
            <div className={r.head}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className={`${r.avatar} ${r.eng}`} aria-hidden="true">ENG</span>
                <div>
                  <h2 className={ui.h6}>Race Wall Engineer</h2>
                  <div className={ui.sub}>{analysis.race.circuit_short_name ?? `Session ${analysis.race.session_key}`} · {analysis.race.session_name}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AudioToggle />
                <Badge tone="ok">On air</Badge>
                <button type="button" onClick={handleClose} className={buttonClass('ghost')} aria-label="Close the race engineer">×</button>
              </div>
            </div>

            {/* Context pills */}
            <div className={r.pills}>
              <Badge tone="accent">CHAOS {analysis.chaos.score}</Badge>
              <Badge tone="muted">{analysis.tyre_degradation.length} stints loaded</Badge>
              {/* Focused driver pill */}
              {focusedDriver && <Badge tone="info">{focusedDriver.code} focus</Badge>}
              {contextPills(analysis).map((label) => (
                <Badge key={label} tone="ok">{label}</Badge>
              ))}
            </div>

            {/* Message feed */}
            <div ref={feedRef} className={r.feed} aria-live="polite">
              {messages.length === 0 && (
                <div className={r.msg}>
                  <span className={`${r.avatar} ${r.eng}`} aria-hidden="true">ENG</span>
                  <div className={`${r.bubble} ${r.eng}`}>
                    <div className={ui.label} style={{ color: 'inherit', fontWeight: 800 }}>Race Engineer</div>
                    <p className={r.bubbleText}>
                      Ready. I have full context for{' '}
                      <b>{analysis.race.circuit_short_name ?? `Session ${analysis.race.session_key}`}</b>: chaos score {analysis.chaos.score}, {analysis.true_pace.length} drivers
                      analysed, {analysis.tyre_degradation.length} stints mapped.
                      {focusedDriver && (
                        <> Focused on <b>{focusedDriver.code}</b>.</>
                      )}{' '}
                      Ask me anything about race strategy.
                    </p>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => {
                const who = msg.role === 'engineer' ? r.eng : r.you
                return (
                  <div key={i} className={`${r.msg} ${msg.role === 'user' ? r.msgUser : ''}`}>
                    <span className={`${r.avatar} ${who}`} aria-hidden="true">{msg.role === 'engineer' ? 'ENG' : 'YOU'}</span>
                    <div className={`${r.bubble} ${who}`}>
                      <div className={ui.label} style={{ color: 'inherit', fontWeight: 800 }}>
                        {msg.role === 'engineer' ? 'Race Engineer' : 'You'}
                      </div>
                      <p className={r.bubbleText}>{msg.content}</p>
                      {msg.role === 'engineer' && msg.confidence !== undefined && (
                        <div className={r.meta}>
                          <span title="Model confidence capped by the engineer notes it actually cited: none → Low, one → Medium, two or more → as declared">
                            <ConfidenceBadge level={(msg.confidence as 'Low' | 'Medium' | 'High' | null) ?? null} />
                          </span>
                          {(msg.cited ?? []).map((c) => (
                            <span key={c.id} className={r.cite} title={c.title}>
                              {c.lap_number != null ? `L${c.lap_number} · ` : ''}{c.title}
                            </span>
                          ))}
                          {(msg.cited ?? []).length === 0 && msg.confidence && (
                            <span className={ui.sub}>no signals cited</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {isSending && (
                <div className={r.msg}>
                  <span className={`${r.avatar} ${r.eng}`} aria-hidden="true">ENG</span>
                  <div className={`${r.bubble} ${r.eng}`} role="status" aria-label="The engineer is answering">
                    <div className={r.typing}><span /><span /><span /></div>
                  </div>
                </div>
              )}
            </div>

            {/* Suggested questions */}
            {messages.length === 0 && (
              <div className={r.suggest}>
                {suggestedQuestions.map((q) => (
                  <button key={q} type="button" onClick={() => sendMessage(q)} className={r.suggestBtn}>{q}</button>
                ))}
              </div>
            )}

            {/* Composer */}
            <div className={r.composer}>
              <div style={{ display: 'flex', gap: 8 }}>
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
                  aria-label="Question for the race engineer"
                  placeholder={rateLimited ? `Message limit reached · reopens in ${formatWait(cooldownLeft)}` : 'Ask about strategy, tyres, pit timing…'}
                  rows={2}
                  className={r.textarea}
                  disabled={isSending || rateLimited}
                />
                <button
                  type="button"
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isSending || rateLimited}
                  className={buttonClass('primary', true)}
                >
                  Send
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
                <span className={ui.sub} style={rateLimited ? { color: 'var(--pw-amber)', fontWeight: 700 } : undefined} role={rateLimited ? 'status' : undefined}>
                  {rateLimited
                    ? `Rate limited · try again in ${formatWait(cooldownLeft)}`
                    : 'Grounded mode · answers cite session signals'}
                </span>
                <span className={ui.sub}>Shift+Enter newline</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
