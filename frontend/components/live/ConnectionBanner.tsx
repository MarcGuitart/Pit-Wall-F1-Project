import type { FeedHealth } from '@/types/live'
import type { LiveConnection } from '@/hooks/useLiveSession'

type Props = {
  connection: LiveConnection
  feed: FeedHealth | null
  /** Seconds since this browser last received a frame from the live server. */
  frameAge: number
  generatedAt: string | null
  error: string | null
  onRetry: () => void
}

/**
 * Says which of the two links is broken, because the answer changes what the
 * page below means.
 *
 *   browser ✗ server  — the page is frozen at an old snapshot
 *   server  ✗ broker  — the page is current, the data behind it is not
 *
 * Silence is never allowed to look like calm: if either link is down the
 * banner is visible and states how long for.
 */
export function ConnectionBanner({
  connection, feed, frameAge, generatedAt, error, onRetry,
}: Props) {
  const linkDown = connection !== 'open' || Boolean(error)
  const feedStale = Boolean(feed?.stale)

  if (!linkDown && !feedStale) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-panel border border-border-subtle rounded-[3px]">
        <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
        <span className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-signal-green">
          Live
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          {feed?.mode === 'replay' ? 'capture replay' : 'OpenF1 MQTT'}
          {generatedAt ? ` · updated ${generatedAt.slice(11, 19)}Z` : ''}
          {feed ? ` · ${feed.messages_total.toLocaleString()} messages` : ''}
        </span>
      </div>
    )
  }

  const red = linkDown
  const tone = red
    ? 'border-signal-red/50 bg-signal-red/10 text-signal-red'
    : 'border-signal-amber/50 bg-signal-amber/10 text-signal-amber'

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 border rounded-[3px] ${tone}`}>
      <span className={`mt-[3px] w-1.5 h-1.5 rounded-full shrink-0 ${red ? 'bg-signal-red' : 'bg-signal-amber'} animate-pulse`} />
      <div className="min-w-0 flex-1">
        <div className="font-display font-bold text-[10px] uppercase tracking-[1.5px]">
          {red ? 'Connection lost' : 'Feed has gone quiet'}
        </div>
        <p className="font-mono text-[10px] text-text-secondary leading-relaxed mt-0.5">
          {red ? (
            <>
              {error ?? 'This page is no longer receiving updates from the live server.'}{' '}
              Last frame {frameAge}s ago — everything below is that frame, not the current race.
              {connection === 'reconnecting' && ' Retrying automatically.'}
            </>
          ) : (
            <>
              The live server has had nothing from the broker for{' '}
              {feed?.last_message_age_s ?? '?'}s (threshold {feed?.stale_after_s}s). The page is
              connected; the race data in it is that old.
              {feed && feed.gaps_observed_total > 0 &&
                ` ${feed.gaps_observed_total} gap(s) so far this session.`}
            </>
          )}
        </p>
      </div>
      {red && (
        <button
          onClick={onRetry}
          className="shrink-0 px-2.5 py-1 bg-bg-elevated border border-border-default rounded-[3px] font-display font-bold text-[9px] uppercase tracking-[1px] text-text-secondary hover:text-text-primary transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  )
}
