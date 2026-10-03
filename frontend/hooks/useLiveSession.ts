'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { authHeaders, getToken } from '@/lib/access'
import type { LiveSnapshot } from '@/types/live'

/**
 * Subscribe to the live snapshot stream for one session.
 *
 * The browser talks to the live server and to nothing else — never to OpenF1.
 * That is not a style preference: the MQTT credentials are the project's, the
 * broker allows a bounded number of subscribers, and one browser tab per viewer
 * opening its own connection would exhaust both. One process holds the
 * subscription; every viewer reads its fan-out.
 *
 * ── why fetch and not EventSource ───────────────────────────────────────────
 *
 * Live is PRO, so the stream carries the same signed token as every other PRO
 * request, in the same `Authorization: Bearer` header. EventSource cannot send
 * a custom header. The only way to pass a token through it is the query string,
 * and a credential in a URL is written to every access log and proxy log on the
 * path and handed on in Referer — which would undo the reason the token is a
 * header rather than a cookie in the first place.
 *
 * So the stream is read with fetch and a ReadableStream. What that costs is
 * EventSource's automatic reconnect, which is reimplemented below with a
 * bounded exponential backoff. What it buys is that the token is never anywhere
 * it should not be.
 *
 * ── two kinds of "the feed is down" ─────────────────────────────────────────
 *
 * Kept separate, because they mean different things to a viewer:
 *
 *   connection  — this browser lost the stream. The page is frozen and says so.
 *                 We retry with backoff and count the attempts.
 *   staleness   — the stream is fine, but the server has had nothing from the
 *                 broker for a while (`snapshot.feed.stale`). The page is live
 *                 and the data is old. This is what the real 28-second Baku
 *                 outage looked like from a browser.
 */

const LIVE_URL = process.env.NEXT_PUBLIC_LIVE_URL ?? (process.env.NODE_ENV === 'production'
  ? 'https://pit-wall-f1-project-live.onrender.com'
  : 'http://localhost:8099')

// Bounded so a live server that is down does not become a retry storm, and low
// enough at the start that a redeploy is invisible during a session.
const BACKOFF_MS = [1000, 2000, 5000, 10000, 20000, 30000]

export type LiveConnection = 'connecting' | 'open' | 'reconnecting'

export type UseLiveSession = {
  snapshot: LiveSnapshot | null
  connection: LiveConnection
  /** Seconds since this browser last received a frame. */
  frameAge: number
  /** Set when the server refuses, is on another session, or is unreachable. */
  error: string | null
  /** True when the refusal was PRO_REQUIRED — the page shows the unlock path. */
  proRequired: boolean
  /** The session the server is actually following, when it is not this one. */
  followingSession: number | null
  reconnect: () => void
}

export function useLiveSession(sessionKey: number | null): UseLiveSession {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null)
  const [connection, setConnection] = useState<LiveConnection>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [proRequired, setProRequired] = useState(false)
  const [followingSession, setFollowingSession] = useState<number | null>(null)
  const [frameAge, setFrameAge] = useState(0)
  const [nonce, setNonce] = useState(0)
  const lastFrame = useRef<number>(Date.now())

  const reconnect = useCallback(() => {
    setError(null)
    setProRequired(false)
    setConnection('connecting')
    setNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    if (sessionKey == null || Number.isNaN(sessionKey)) return

    const controller = new AbortController()
    let cancelled = false
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const fail = (message: string, isPro = false) => {
      if (cancelled) return
      setError(message)
      setProRequired(isPro)
      setConnection('reconnecting')
    }

    /** One connection attempt. Resolves when the stream ends for any reason. */
    async function connect(): Promise<'retry' | 'stop'> {
      if (!getToken()) {
        fail('Live mode needs a PRO access code.', true)
        return 'stop'
      }

      const res = await fetch(`${LIVE_URL}/live/${sessionKey}/stream`, {
        headers: { Accept: 'text/event-stream', ...authHeaders() },
        signal: controller.signal,
        cache: 'no-store',
      })

      if (res.status === 402) {
        // The token is missing, expired or revoked. Retrying cannot fix it.
        fail('Live mode needs a PRO access code.', true)
        return 'stop'
      }
      if (res.status === 409) {
        const body = await res.json().catch(() => null)
        if (!cancelled && typeof body?.session_key === 'number') setFollowingSession(body.session_key)
        fail(body?.message ?? 'This live server is following another session.')
        return 'stop'
      }
      if (!res.ok || !res.body) {
        fail(`The live server answered HTTP ${res.status}.`)
        return 'retry'
      }

      if (!cancelled) {
        setConnection('open')
        setError(null)
        setProRequired(false)
        attempt = 0
      }

      // The browser undoes Content-Encoding for us, so this is plain SSE text.
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      while (!cancelled) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        let split: number
        while ((split = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, split)
          buffer = buffer.slice(split + 2)
          if (!frame.startsWith('data: ')) continue     // a keep-alive comment
          try {
            setSnapshot(JSON.parse(frame.slice(6)) as LiveSnapshot)
            lastFrame.current = Date.now()
          } catch {
            /* a truncated frame: keep the last good snapshot */
          }
        }
      }
      return 'retry'
    }

    async function loop() {
      while (!cancelled) {
        let outcome: 'retry' | 'stop' = 'retry'
        try {
          outcome = await connect()
        } catch (err) {
          if (cancelled || (err as Error)?.name === 'AbortError') return
          fail(
            process.env.NODE_ENV === 'production'
              ? 'The live server is not reachable right now. Retrying automatically.'
              : `No live server at ${LIVE_URL}. Start it with: python scripts/live_server.py`,
          )
        }
        if (cancelled || outcome === 'stop') return

        setConnection('reconnecting')
        const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
        attempt += 1
        await new Promise<void>((resolve) => {
          timer = setTimeout(resolve, wait)
        })
      }
    }

    void loop()

    return () => {
      cancelled = true
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [sessionKey, nonce])

  useEffect(() => {
    const id = setInterval(() => {
      setFrameAge(Math.round((Date.now() - lastFrame.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return { snapshot, connection, frameAge, error, proRequired, followingSession, reconnect }
}

export { LIVE_URL }
