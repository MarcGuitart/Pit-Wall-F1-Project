function lerpColor(a: string, b: string, t: number): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]
  const [ar, ag, ab] = parse(a)
  const [br, bg, bb] = parse(b)
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const b2 = Math.round(ab + (bb - ab) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b2.toString(16).padStart(2, '0')}`
}

export function speedToColor(speed: number): string {
  if (speed <= 150) return '#E8001D'
  if (speed <= 250) {
    const t = (speed - 150) / 100
    return lerpColor('#E8001D', '#FFB020', t)
  }
  const t = Math.min((speed - 250) / 130, 1)
  return lerpColor('#FFB020', '#23D18B', t)
}

export function throttleToColor(throttle: number): string {
  return lerpColor('#4DA3FF', '#23D18B', throttle / 100)
}

export function gearToColor(gear: number): string {
  const map: Record<number, string> = {
    1: '#A66CFF', 2: '#A66CFF',
    3: '#4DA3FF', 4: '#4DA3FF',
    5: '#23D18B', 6: '#23D18B',
    7: '#FFB020', 8: '#FFB020',
  }
  return map[gear] ?? '#4A5568'
}

export function metricToColor(
  metric: 'speed' | 'throttle' | 'brake' | 'gear',
  speed: number,
  throttle: number,
  brake: boolean,
  gear: number,
): string {
  if (metric === 'speed') return speedToColor(speed)
  if (metric === 'throttle') return throttleToColor(throttle)
  if (metric === 'brake') return brake ? '#E8001D' : 'rgba(255,255,255,0.1)'
  return gearToColor(gear)
}
