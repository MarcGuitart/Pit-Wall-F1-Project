'use client'

import { useEffect, useState } from 'react'
import { addWatch, isWatching, notificationsSupported, onWatchesChange, removeWatch, type Watch } from '@/lib/notify'

/**
 * "Notify me when it starts". Styled by the caller through className so it
 * sits in both the classic UI and the Modernist live/preview pages.
 */
export function NotifyButton({ watch, className = '', label = 'Notify me when it starts' }: {
  watch: Watch
  className?: string
  label?: string
}) {
  const [on, setOn] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [supported, setSupported] = useState(false)     // decided after mount: the server has no Notification
  useEffect(() => {
    setSupported(notificationsSupported())
    const sync = () => setOn(isWatching(watch.id))
    sync()
    return onWatchesChange(sync)
  }, [watch.id])

  if (!supported) return null

  async function toggle() {
    setNote(null)
    if (on) {
      removeWatch(watch.id)
      return
    }
    const r = await addWatch(watch)
    if (r === 'denied') setNote('Notifications are blocked for this site — allow them in the browser’s site settings.')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <button type="button" onClick={toggle} className={className} aria-pressed={on}>
        {on ? '✓ We’ll notify you · cancel' : `🔔 ${label}`}
      </button>
      <span style={{ fontSize: 11, lineHeight: 1.4, opacity: 0.65, maxWidth: 360 }}>
        {note ?? (on
          ? 'A browser notification, while any tab of this site is open — even in the background.'
          : 'Browser notification · works while a tab of this site is open.')}
      </span>
    </div>
  )
}
