'use client'

import { useEffect, useState } from 'react'
import s from './live.module.css'
import { archivo } from '@/lib/fonts'
import { usePwTheme } from '@/lib/pwTheme'
import { NotifyButton } from '@/components/notify/NotifyButton'
import { AddToCalendarButton } from '@/components/ui/AddToCalendarButton'
import { fetchNextLiveSession, type NextLiveSessionInfo } from '@/lib/liveStatus'

/** The live page with nothing live: when the next session is, and a way to be told. */
export function NotLiveYet() {
  const [theme] = usePwTheme()
  const [next, setNext] = useState<NextLiveSessionInfo | null | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { fetchNextLiveSession(new Date().getFullYear()).then(setNext).catch(() => setNext(null)) }, [])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const start = next ? new Date(next.dateStart).getTime() : null
  const left = start != null ? Math.max(0, Math.floor((start - now) / 1000)) : null
  const fmt = (t: number) => {
    const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60), x = t % 60
    return `${d ? `${d}d ` : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`
  }
  return (
    <div className={`${s.root} ${archivo.className}`} data-theme={theme} style={{ minHeight: '70vh' }}>
      <header className={s.header}>
        <div style={{ minWidth: 0 }}>
          <div className={s.kicker}><span className={s.square} />Live timing · nothing on track right now</div>
          <h1 className={s.h1}>Not live yet</h1>
          <div className={s.meta}>
            {next === undefined ? <span>Checking the calendar…</span>
              : next ? <><b>{next.meetingName} · {next.sessionName}</b><span>{new Date(next.dateStart).toLocaleString([], { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} your time</span></>
                : <span>No upcoming session is scheduled.</span>}
          </div>
        </div>
        {next && left != null && (
          <div className={s.headRight}>
            <div className={s.cells} style={{ gridTemplateColumns: '1fr', border: '2px solid var(--pw-divider)' }}>
              <div className={`${s.cell} ${s.cellTight}`}><div className={s.label}>Starts in</div><div className={s.mid}>{left > 0 ? fmt(left) : 'Any moment'}</div></div>
            </div>
          </div>
        )}
      </header>
      {next && (
        <section className={`${s.cells} ${s.ruled}`} style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
          <div className={s.cell}>
            <div className={s.label} style={{ marginBottom: 10 }}>Tell me when it starts</div>
            <NotifyButton
              watch={{ kind: 'live', id: `live-${next.dateStart}`, label: `${next.meetingName} ${next.sessionName}`, startsAt: next.dateStart }}
              className={s.btn}
            />
          </div>
          <div className={s.cell}>
            <div className={s.label} style={{ marginBottom: 10 }}>Or put it in your calendar</div>
            <AddToCalendarButton event={{
              uid: `pitwall-${next.dateStart}@pitwallengineer.com`,
              summary: `${next.meetingName} — ${next.sessionName}`,
              description: 'Live on the pit wall: https://pitwallengineer.com',
              location: next.circuitShortName ?? undefined,
              dateStart: next.dateStart,
              dateEnd: next.dateEnd ?? new Date(new Date(next.dateStart).getTime() + 3600_000).toISOString(),
            }} />
          </div>
        </section>
      )}
    </div>
  )
}
