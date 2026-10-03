'use client'

import { useEffect, useRef, useState } from 'react'
import s from './live.module.css'
import { liveEngineerChat, type EngineerAnswer } from '@/lib/api'
import { buildLiveDigest } from '@/lib/liveContext'
import type { LiveSnapshot } from '@/types/live'

/**
 * Talk to the pit wall while the session runs.
 *
 * Engineer: an analyst answering from the live digest — the same numbers the
 * page shows, sent with the question. Team radio: the user plays the engineer
 * and a driver answers in character, grounded in that driver's data. The radio
 * replies are role-play and say so on every message; they are never presented
 * as anything the real driver said.
 */

type Msg =
  | { role: 'user'; text: string; mode: Mode; driver: string | null }
  | { role: 'ai'; reply: EngineerAnswer; mode: Mode; driver: string | null }
  | { role: 'error'; text: string }

type Mode = 'engineer' | 'radio'

const PROMPTS: Record<string, string[]> = {
  engineer_race: ['Who has the best pace on this stint?', 'Is anyone in an undercut window?', 'What changed in the last five laps?', 'Who is losing the most time to tyre wear?'],
  engineer_practice: ['Who looks quickest on a long run?', 'Who has the most to find on their ideal lap?', 'Which sectors decide the top three?', 'Who has not set a representative lap yet?'],
  radio: ['How are the tyres?', 'Gap to the car ahead, can you push?', 'Box this lap — confirm?', 'Talk me through that last lap.'],
}

export function LiveEngineer({ snapshot, drivers, selected }: { snapshot: LiveSnapshot; drivers: string[]; selected: string | null }) {
  const [mode, setMode] = useState<Mode>('engineer')
  const [driver, setDriver] = useState<string | null>(selected)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const latest = useRef(snapshot)
  latest.current = snapshot
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!driver && selected) setDriver(selected) }, [selected, driver])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [msgs.length])

  const profile = snapshot.profile === 'race' ? 'race' : 'practice'
  const prompts = mode === 'radio' ? PROMPTS.radio : PROMPTS[`engineer_${profile}`]

  async function ask(q: string) {
    const question = q.trim()
    if (!question || busy) return
    if (mode === 'radio' && !driver) {
      setMsgs(m => [...m, { role: 'error', text: 'Pick a driver to call on the radio.' }])
      return
    }
    setInput('')
    setBusy(true)
    setMsgs(m => [...m, { role: 'user', text: question, mode, driver }])
    try {
      const snap = latest.current
      const { context, signals } = buildLiveDigest(snap, driver)
      const reply = await liveEngineerChat({
        session_key: snap.session_key ?? 0, question, mode, driver,
        session_name: [snap.location, snap.session_name].filter(Boolean).join(' ') || null,
        context, signals,
      })
      setMsgs(m => [...m, { role: 'ai', reply, mode, driver }])
    } catch (e) {
      setMsgs(m => [...m, { role: 'error', text: (e as Error)?.message ?? 'The engineer is not reachable right now.' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.panel} style={{ minHeight: 560 }}>
      <div className={s.secHead} style={{ alignItems: 'center' }}>
        <h6 className={s.h6}>Engineer AI</h6>
        <span className={s.sub}>Answers from the live data on this page · read-only</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className={s.seg}>
            {([['engineer', 'Engineer'], ['radio', 'Team radio']] as const).map(([k, l]) => (
              <button key={k} className={`${s.segOpt} ${s.segBtn} ${mode === k ? s.segOn : ''}`} style={{ padding: '5px 12px' }} onClick={() => setMode(k)} aria-pressed={mode === k}>{l}</button>
            ))}
          </div>
          <select className={s.btn} value={driver ?? ''} onChange={e => setDriver(e.target.value || null)} aria-label="Driver" style={{ background: 'var(--pw-surface)' }}>
            <option value="">{mode === 'radio' ? 'Pick a driver' : 'Whole field'}</option>
            {drivers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {mode === 'radio' && (
        <div className={s.foot} style={{ borderBottom: '1px solid var(--pw-divider)', color: 'var(--pw-accent-text)' }}>
          Simulated radio. You are the engineer; the AI answers in {driver ?? 'the driver'}&apos;s voice using only their live data. It is not the real driver and not real team radio.
        </div>
      )}

      <div className={s.scroll} style={{ flex: 1, padding: '12px 20px', display: 'grid', gap: 12, alignContent: 'start', maxHeight: 620 }}>
        {!msgs.length && (
          <div className={s.sub} style={{ fontSize: 13, lineHeight: 1.6 }}>
            {mode === 'radio'
              ? 'Pick a driver and call them. Their answers use their position, gaps, tyre and lap times as the feed has them right now.'
              : 'Ask about pace, tyres, gaps, stops or what race control just did. Every answer is built from the snapshot you are looking at, sent with the question.'}
          </div>
        )}
        {msgs.map((m, i) => {
          if (m.role === 'error') return <div key={i} style={{ fontSize: 13, color: 'var(--pw-accent-text)' }}>{m.text}</div>
          if (m.role === 'user') return (
            <div key={i} style={{ justifySelf: 'end', maxWidth: '80%', background: 'var(--pw-surface-2)', border: '2px solid var(--pw-divider)', padding: '8px 12px', fontSize: 14 }}>
              <div className={s.label} style={{ marginBottom: 2 }}>{m.mode === 'radio' ? `You → ${m.driver}` : 'You'}</div>{m.text}
            </div>
          )
          const radio = m.mode === 'radio'
          return (
            <div key={i} style={{ maxWidth: '88%', borderLeft: `4px solid ${radio ? 'var(--pw-accent)' : 'var(--pw-text)'}`, padding: '6px 12px', fontSize: 14, lineHeight: 1.55 }}>
              <div className={s.label} style={{ marginBottom: 4 }}>
                {radio ? `${m.driver} · simulated radio` : 'Engineer'}
                {m.reply.confidence ? ` · ${m.reply.confidence} confidence` : ''}
                {m.reply.provider === 'offline' ? ' · offline' : ''}
              </div>
              <div style={{ fontStyle: radio ? 'italic' : undefined }}>{radio ? `“${m.reply.answer}”` : m.reply.answer}</div>
              {!!m.reply.cited_signals?.length && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {m.reply.cited_signals.map(c => (
                    <span key={c.id} style={{ fontSize: 11, border: '1px solid var(--pw-divider)', padding: '1px 6px' }} title={c.title}>
                      {c.lap_number ? `L${c.lap_number} · ` : ''}{c.title.slice(0, 48)}{c.title.length > 48 ? '…' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {busy && <div className={s.sub}>{mode === 'radio' ? `Calling ${driver}…` : 'Engineer is reading the data…'}</div>}
        <div ref={end} />
      </div>

      <div style={{ padding: '10px 20px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--pw-divider)' }}>
        {prompts.map(p => <button key={p} className={s.btn} style={{ fontSize: 11 }} disabled={busy} onClick={() => ask(p)}>{p}</button>)}
      </div>
      <form onSubmit={e => { e.preventDefault(); void ask(input) }} style={{ display: 'flex', borderTop: '2px solid var(--pw-divider)' }}>
        <input
          value={input} onChange={e => setInput(e.target.value)} maxLength={500}
          placeholder={mode === 'radio' ? `Radio to ${driver ?? '…'}` : 'Ask the pit wall…'}
          style={{ flex: 1, font: 'inherit', fontSize: 14, padding: '14px 20px', background: 'transparent', color: 'var(--pw-text)', border: 0, outline: 'none' }}
          aria-label="Question"
        />
        <button type="submit" disabled={busy || !input.trim()} className={s.segOn} style={{ font: 'inherit', fontWeight: 800, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0 22px', border: 0, cursor: 'pointer', opacity: busy || !input.trim() ? 0.5 : 1 }}>
          {mode === 'radio' ? 'Transmit' : 'Ask'}
        </button>
      </form>
    </div>
  )
}
