import type { EngineerNote } from '@/types'
import type { Tone } from '@/components/ui'

/** One tone per engineer-note type, shared by the signal summary and the full list. */
export const NOTE_TYPE_TONE: Record<EngineerNote['type'], Tone> = {
  TYRE_DEGRADATION: 'warn',
  UNDERCUT:         'purple',
  PIT_IMPACT:       'info',
  CHAOS:            'accent',
  TRAFFIC:          'muted',
  TRUE_PACE:        'ok',
  WEATHER:          'info',
  ANOMALY:          'purple',
}
