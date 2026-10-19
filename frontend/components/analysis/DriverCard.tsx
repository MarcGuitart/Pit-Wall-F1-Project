'use client'

import { useEffect, useRef } from 'react'
import type { TruePaceRow, TyreDegradationRow, PitImpactRow, TeamRadioClip } from '@/types'
import { RadioClipPlayer } from './teamradio/RadioClipPlayer'
import { formatLapTime, formatDelta, formatSlope, formatLaneDuration } from '@/lib/format'
import { COMPOUND_COLORS } from '@/lib/constants'
import { ConfidenceBadge, buttonClass, toneClass, ui } from '@/components/ui'
import { teamColour } from './TruePaceTable'
import a from './analysis.module.css'
import d from './driverCard.module.css'

type Props = {
  driver: TruePaceRow
  stints: TyreDegradationRow[]
  pits: PitImpactRow[]
  radios?: TeamRadioClip[]
  raceName: string
  onClose: () => void
  onAskEngineer?: () => void
}

export function DriverCard({ driver, stints, pits, radios = [], raceName, onClose, onAskEngineer }: Props) {
  // A modal dialog (decision of 18 Oct, Block 31): focus moves into it on
  // open, Tab and Shift+Tab stay inside it, Escape closes it, and on close
  // focus goes back to what opened it. onClose is read through a ref so a
  // parent re-render does not re-run this (and steal focus back).
  const cardRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const card = cardRef.current
    card?.focus()
    const focusables = () => Array.from(card?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    ) ?? [])
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeRef.current(); return }
      if (e.key !== 'Tab' || !card) return
      const f = focusables()
      if (!f.length) { e.preventDefault(); card.focus(); return }
      const first = f[0], last = f[f.length - 1], active = document.activeElement
      if (e.shiftKey && (active === first || active === card || !card.contains(active))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (active === last || !card.contains(active))) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      if (opener && opener.isConnected) opener.focus()
    }
  }, [])

  const teamColor = teamColour(driver.team_colour)
  const gainTone = (n: number) => (n > 0 ? toneClass('ok') : n < 0 ? toneClass('accent') : a.muted)

  return (
    <div className={ui.backdrop} onClick={onClose}>
      <div
        ref={cardRef}
        tabIndex={-1}
        className={d.card}
        role="dialog"
        aria-modal="true"
        aria-label={`${driver.driver_code} — driver card`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={d.head} style={{ boxShadow: `inset 6px 0 0 ${teamColor}` }}>
          <div className={a.row} style={{ gap: 16 }}>
            {/* Driver number watermark */}
            <div className={d.number} style={{ color: teamColor }} aria-hidden="true">{driver.driver_number}</div>
            <div>
              <div className={d.code}>{driver.driver_code}</div>
              <div className={ui.sub} style={{ color: 'var(--pw-text)' }}>{driver.team_name}</div>
              <div className={ui.sub}>{raceName}</div>
            </div>
          </div>

          {/* Pace rank badge + actual race result, side by side on purpose —
              True Pace strips out pit/SC/traffic, the race result doesn't */}
          <div className={a.row} style={{ gap: 0 }}>
            <div className={d.stat}>
              <div className={ui.mid} style={{ color: driver.rank === 1 ? 'var(--pw-accent-text)' : teamColor }}>P{driver.rank}</div>
              <div className={ui.label}>True Pace</div>
            </div>
            {driver.finishing_position != null && (
              <div className={d.stat}>
                <div className={ui.mid} style={{ color: 'var(--pw-muted)' }}>P{driver.finishing_position}</div>
                <div className={ui.label}>Race Result</div>
                {driver.grid_position != null && driver.positions_gained != null && (
                  <div className={ui.sub}>
                    from P{driver.grid_position}{' '}
                    <b className={gainTone(driver.positions_gained)}>
                      {driver.positions_gained > 0 ? '+' : ''}{driver.positions_gained}
                    </b>
                  </div>
                )}
              </div>
            )}
            <button type="button" onClick={onClose} className={buttonClass('ghost')} aria-label="Close the driver card" style={{ alignSelf: 'flex-start' }}>×</button>
          </div>
        </div>

        <div className={d.body}>
          {/* Left: pace metrics */}
          <div className={d.col}>
            <section>
              <h3 className={d.sectionTitle}>Pace Analysis</h3>
              <div className={a.kv} style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                {[
                  { label: 'Median Clean Lap', value: formatLapTime(driver.median_clean_lap) },
                  { label: 'Fastest Clean Lap', value: formatLapTime(driver.fastest_clean_lap) },
                  { label: 'Traffic Score', value: `${driver.traffic_score.toFixed(1)}s` },
                  { label: 'Sample Size', value: `${driver.sample_size} laps` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className={ui.label}>{label}</div>
                    <div className={a.num} style={{ fontSize: 16 }}>{value}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Exclusion log */}
            <section>
              <h3 className={d.sectionTitle}>Exclusion Log</h3>
              <ul className={`${a.footList} ${ui.sub}`}>
                {driver.exclusion_log.map((log, i) => <li key={i}>· {log}</li>)}
              </ul>
            </section>

            {/* Confidence */}
            <div className={a.row}>
              <span className={ui.label}>Data confidence:</span>
              <ConfidenceBadge level={driver.confidence} />
            </div>
          </div>

          {/* Right: stints + pits */}
          <div className={d.col}>
            {/* Stint map */}
            <section>
              <h3 className={d.sectionTitle}>Stint Map</h3>
              {stints.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {stints.map((stint, i) => {
                    const color = COMPOUND_COLORS[stint.compound] ?? 'var(--pw-muted)'
                    const lapCount = stint.lap_end - stint.lap_start + 1
                    return (
                      <div key={i} className={a.row}>
                        <span className={a.compound} style={{ borderColor: color, color }} aria-label={stint.compound}>{stint.compound.slice(0, 1)}</span>
                        <div className={a.grow}>
                          <div className={a.track} style={{ height: 10 }}>
                            <span style={{ width: `${Math.min((lapCount / 71) * 100, 100)}%`, background: color, opacity: 0.6 }} />
                          </div>
                          <div className={`${a.between} ${ui.sub}`} style={{ marginTop: 2, fontSize: 11 }}>
                            <span>L{stint.lap_start}–{stint.lap_end}</span>
                            <span>{formatSlope(stint.degradation_slope)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className={ui.sub} style={{ margin: 0 }}>No stint data.</p>
              )}
            </section>

            {/* Pit stops */}
            {pits.length > 0 && (
              <section>
                <h3 className={d.sectionTitle}>Pit Stops</h3>
                <div style={{ display: 'grid', gap: 4 }}>
                  {pits.map((pit, i) => (
                    <div key={i} className={a.row} style={{ fontSize: 13 }}>
                      <span className={a.muted}>L{pit.lap_number}</span>
                      <span>{formatLaneDuration(pit.lane_duration)}</span>
                      {pit.net_position_change != null && (
                        <b className={gainTone(pit.net_position_change)}>
                          {pit.net_position_change > 0 ? '+' : ''}{pit.net_position_change} pos
                        </b>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Team radio — archive clips linked from F1's CDN; one plays at a time */}
            {radios.length > 0 && (
              <section data-testid="driver-radios">
                <div className={a.between} style={{ marginBottom: 4 }}>
                  <h3 className={d.sectionTitle} style={{ margin: 0 }}>Team Radio · {radios.length}</h3>
                  <span className={ui.sub} style={{ fontSize: 11 }}>F1&apos;s selection, not the full record</span>
                </div>
                <div className={d.radios}>
                  {radios.map((clip) => (
                    <RadioClipPlayer key={clip.recording_url} clip={clip} compact />
                  ))}
                </div>
              </section>
            )}

            {/* Verdict */}
            <section className={d.verdict}>
              <h3 className={d.sectionTitle}>Engineer verdict</h3>
              <p className={a.para}>{driver.verdict}</p>
            </section>

            {/* Ask engineer button */}
            {onAskEngineer && (
              <button type="button" onClick={onAskEngineer} className={buttonClass('ink')} style={{ justifyContent: 'center' }}>
                Ask engineer about {driver.driver_code} →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
