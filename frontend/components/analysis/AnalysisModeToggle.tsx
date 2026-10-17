import { Segmented } from '@/components/ui'
import a from './analysis.module.css'

type AnalysisModeToggleProps = {
  mode: 'strategy' | 'data'
  sessionType: string
  lapCount: number
  onChange: (mode: 'strategy' | 'data') => void
}

export function AnalysisModeToggle({
  mode, sessionType, lapCount, onChange,
}: AnalysisModeToggleProps) {
  return (
    <div className={a.toolbar}>
      <Segmented
        role="tablist"
        label="Strategy or data view"
        value={mode}
        onChange={onChange}
        options={[
          { value: 'strategy', label: 'Strategy View' },
          { value: 'data', label: 'Data View' },
        ]}
      />
      <span className={a.toolbarNote}>
        {mode === 'strategy' ? 'Strategy View' : 'Data View'}
        {' · '}
        <b>{sessionType} session</b>
        {' · '}
        {lapCount} laps indexed
      </span>
    </div>
  )
}
