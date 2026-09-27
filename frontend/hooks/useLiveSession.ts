'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LiveSnapshot } from '@/types/live'

/**
 * Subscribe to the live snapshot stream for one session.
 *
 * The browser talks to the live server (backend/scripts/live_server.py) and to
 * nothing else — never to OpenF1. That is not a style preference: the MQTT
 * credentials are the project's, the broker allows a bounded number of
 * subscribers, and one browser tab per viewer opening its own connection would
 * exhaust both. One process holds the subscription; every viewer reads its
 * fan-out.
 *
 * Two kinds of "the feed is down", kept separate because they mean different
 * things to a viewer:
 *
 *   connection  — this browser lost the SSE stream. The page is frozen and we
 *                 say so. EventSource retries on its own; we count attempts so
 *                 the banner can say how long it has been trying.
 *   staleness   — the SSE stream is fine, but the server has had nothing from
 *                 the broker for a while (`snapshot.feed.stale`). The page is
 *                 live and the data is old. This is what the real 28-second
 *                 Baku outage looked like from a browser.
 */

const LIVE_URL = process.env.NEXT_PUBLIC_LIVE_URL ?? 'http://localhost:8099'

export type LiveConnection = 'connecting' | 'open' | 'reconnecting'

export type UseLiveSession = {
  snapshot: LiveSnapshot | null
  connection: LiveConnection
  /** Seconds since this browser last received a frame. */
  frameAge: number
  /** Set when the server is following a different session, or is unreachable. */
  error: string | null
  reconnect: () => void
}

export function useLiveSession(sessionKey: number | null): UseLiveSession {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null)
  const [connection, setConnection] = useState<LiveConnection>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [frameAge, setFrameAge] = useState(0)
  const [nonce, setNonce] = useState(0)
  const lastFrame = useRef<number>(Date.now())

  const reconnect = useCallback(() => {
    setError(null)
    setConnection('connecting')
    setNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    if (sessionKey == null || Number.isNaN(sessionKey)) return

    let cancelled = false

    // A 409 means this server is on another session — an EventSource cannot
    // read a status code, so ask once over fetch before opening the stream.
    fetch(`${LIVE_URL}/live/${sessionKey}/snapshot`)
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (cancelled) return
        if (res.status === 409 && body) {
          setError(body.message ?? 'This live server is following another session.')
          setConnection('reconnecting')
          return
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setSnapshot(body as LiveSnapshot)
        lastFrame.current = Date.now()
      })
      .catch(() => {
        if (!cancelled) {
          setError(`No live server at ${LIVE_URL}. Start it with: python scripts/live_server.py`)
          setConnection('reconnecting')
        }
      })

    const source = new EventSource(`${LIVE_URL}/live/${sessionKey}/stream`)

    source.onopen = () => {
      if (cancelled) return
      setConnection('open')
      setError(null)
    }

    source.onmessage = (event) => {
      if (cancelled) return
      try {
        setSnapshot(JSON.parse(event.data) as LiveSnapshot)
        lastFrame.current = Date.now()
        setConnection('open')
        setError(null)
      } catch {
        /* a truncated frame: keep the last good snapshot */
      }
    }

    // EventSource reconnects by itself; this only reflects that in the UI.
    source.onerror = () => {
      if (!cancelled) setConnection('reconnecting')
    }

    return () => {
      cancelled = true
      source.close()
    }
  }, [sessionKey, nonce])

  useEffect(() => {
    const id = setInterval(() => {
      setFrameAge(Math.round((Date.now() - lastFrame.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return { snapshot, connection, frameAge, error, reconnect }
}

export { LIVE_URL }
