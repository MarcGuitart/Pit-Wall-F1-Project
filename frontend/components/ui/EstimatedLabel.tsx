import ui from './ui.module.css'

export function EstimatedLabel() {
  return (
    <span className={ui.sub} style={{ fontStyle: 'italic', fontSize: 11 }}>
      estimated from OpenF1 data
    </span>
  )
}
