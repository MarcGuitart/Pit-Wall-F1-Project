'use client'

import type { SessionInfo } from '@/types'
import { AddToCalendarButton } from '@/components/ui/AddToCalendarButton'
import { Badge, buttonClass } from '@/components/ui'
import { sessionState, showsProChip, type StateContext } from '@/lib/sessionStates'
import { useOpenAccess } from '@/lib/openAccess'
import { useWarmRace } from '@/lib/warm'
import l from './landing.module.css'

const WHEN = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export type PanelData =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; sessions: SessionInfo[] }

/**
 * The sessions of one meeting, in line under its row on /races (block 33).
 * Fetched when opened, never before; the grid keeps them per meeting. Every
 * session that has run opens at /race/<session_key> (block 45): a real link,
 * so a modified click opens a tab; a plain one goes through onOpen (the sweep
 * and the analysis loader).
 */
export function MeetingPanel({ id, cellId, place, gpName, data, ctx, onRetry, onOpen }: {
  id: string
  cellId: string
  place: string
  gpName: string
  data: PanelData
  ctx: StateContext
  onRetry: () => void
  onOpen: (sessionKey: number, click: React.MouseEvent, label: string) => void
}) {
  const openWeek = useOpenAccess((st) => st.open)   // no PRO chip while everything is free (block 50)
  const warm = useWarmRace()
  return (
    <div id={id} className={l.panel} role="region" aria-labelledby={cellId} aria-busy={data.status === 'loading'}>
      <h3 className={l.panelTitle}>Sessions, {place}</h3>
      {data.status === 'loading' && (
        <ul className={l.panelList} aria-hidden="true">
          {/* As many rows as a sprint weekend has, so the list never grows the panel when it arrives. */}
          {Array.from({ length: 7 }, (_, i) => (
            <li key={i} className={`${l.panelRow} ${l.panelSkeleton}`}><span /><span /><span /></li>
          ))}
        </ul>
      )}
      {data.status === 'error' && (
        <div className={l.panelError} role="alert">
          <span>{data.message}</span>
          <button type="button" className={buttonClass('default')} onClick={onRetry}>Retry</button>
        </div>
      )}
      {data.status === 'ready' && data.sessions.length === 0 && (
        <p className={l.panelEmpty}>No sessions are listed for this meeting yet.</p>
      )}
      {data.status === 'ready' && data.sessions.length > 0 && (
        <ul className={l.panelList}>
          {[...data.sessions].sort((a, b) => a.date_start.localeCompare(b.date_start)).map((s) => {
            const st = sessionState(s, ctx)
            return (
              <li key={s.session_key} className={l.panelRow} data-state={st.kind}>
                <span className={l.panelName}>{s.session_name}</span>
                <span className={l.panelWhen}>{WHEN.format(new Date(s.date_start))}</span>
                <span className={l.panelState}>
                  {st.label || null}
                  {showsProChip(ctx.season) && !openWeek && !s.is_cancelled && <> <Badge tone="warn">PRO</Badge></>}
                </span>
                <span className={l.panelAction}>
                  {st.action === 'open' && (
                    <a
                      href={`/race/${s.session_key}`}
                      {...warm(`/race/${s.session_key}`)}
                      className={buttonClass('primary')}
                      onClick={(e) => {
                        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                        e.preventDefault()
                        onOpen(s.session_key, e, `${place} · ${s.session_name}`)
                      }}
                    >
                      Open analysis
                    </a>
                  )}
                  {st.action === 'calendar' && s.date_end && (
                    <AddToCalendarButton
                      variant="system"
                      sessionKey={s.session_key}
                      event={{
                        uid: `pitwall-${s.session_key}@pitwallengineer.com`,
                        summary: `${gpName}: ${s.session_name}`,
                        location: place,
                        dateStart: s.date_start,
                        dateEnd: s.date_end,
                      }}
                    />
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
