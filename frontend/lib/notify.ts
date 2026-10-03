/**
 * "Tell me when it starts" — browser notifications for a session that is not
 * live yet, or a race whose analysis is not published yet.
 *
 * Deliberately local: the watches live in this browser's localStorage and
 * NotifyWatcher checks them while any tab of the site is open (in the
 * background is fine). A notification with every tab closed needs Web Push —
 * a service worker, a push service and a server that sends — which this is
 * not. The UI says so next to the button, and offers the calendar file too.
 */

export type Watch =
  | { kind: 'live'; id: string; label: string; startsAt: string | null }
  | { kind: 'analysis'; id: string; label: string; sessionKey: number; readyAt: string | null }

const KEY = 'pw_notify_watches'
const EVENT = 'pw-notify-change'

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getWatches(): Watch[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function save(list: Watch[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list))
  } catch { /* private mode: the watch lasts for this page only */ }
  window.dispatchEvent(new Event(EVENT))
}

export function onWatchesChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn)
  window.addEventListener('storage', fn)
  return () => {
    window.removeEventListener(EVENT, fn)
    window.removeEventListener('storage', fn)
  }
}

export function isWatching(id: string): boolean {
  return getWatches().some(w => w.id === id)
}

/** Asks for permission if needed; resolves to whether the watch was set. */
export async function addWatch(w: Watch): Promise<'set' | 'denied' | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  let perm = Notification.permission
  if (perm === 'default') perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  save([...getWatches().filter(x => x.id !== w.id), w])
  return 'set'
}

export function removeWatch(id: string) {
  save(getWatches().filter(w => w.id !== id))
}

export function fire(title: string, body: string, url: string) {
  try {
    const n = new Notification(title, { body, tag: url, icon: '/favicon.ico' })
    n.onclick = () => {
      window.focus()
      window.location.href = url
      n.close()
    }
  } catch { /* the permission was revoked since */ }
}
