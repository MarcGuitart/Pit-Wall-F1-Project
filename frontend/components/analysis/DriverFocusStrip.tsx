'use client'

import { motion, AnimatePresence } from 'framer-motion'

type DriverFocusStripProps = {
  driverCode: string | null
  driverName: string | null
  onClear: () => void
}

export function DriverFocusStrip({ driverCode, driverName, onClear }: DriverFocusStripProps) {
  return (
    <AnimatePresence>
      {driverCode && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="flex items-center justify-between rounded-[3px] cursor-pointer"
          style={{
            background: 'rgba(77,163,255,.06)',
            border: '1px solid rgba(77,163,255,.15)',
            padding: '7px 12px',
            marginBottom: '10px',
          }}
          onClick={onClear}
        >
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'rgba(77,163,255,.8)' }} />
            <span className="font-mono text-[11px]" style={{ color: '#4DA3FF' }}>
              Focused on:{' '}
              <span className="font-bold">{driverCode}</span>
              {driverName && <span className="text-text-secondary"> — {driverName}</span>}
              <span className="text-text-muted"> · showing driver-specific signals</span>
            </span>
          </div>
          <button
            type="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onClear() }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClear() } }}
            className="font-display font-bold text-[9px] uppercase tracking-[1px] text-text-muted hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal-blue rounded-[2px]"
          >
            ✕ Clear focus
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
