'use client'

import { buttonClass } from '@/components/ui'
import a from './analysis.module.css'

type DriverFocusStripProps = {
  driverCode: string | null
  driverName: string | null
  onClear: () => void
}

/** The driver every panel is focused on; a click anywhere on it clears the focus. */
export function DriverFocusStrip({ driverCode, driverName, onClear }: DriverFocusStripProps) {
  if (!driverCode) return null
  return (
    <div className={a.focus} onClick={onClear} role="status">
      <span>
        Focused on:{' '}
        <b>{driverCode}</b>
        {driverName && <span> — {driverName}</span>}
        <span className={a.muted}> · showing driver-specific signals</span>
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClear() }}
        className={buttonClass('ink')}
      >
        ✕ Clear focus
      </button>
    </div>
  )
}
