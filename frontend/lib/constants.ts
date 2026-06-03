export const TEAM_COLORS: Record<string, string> = {
  'Red Bull Racing':    '#3671C6',
  'Ferrari':           '#E8001D',
  'Mercedes':          '#27F4D2',
  'McLaren':           '#FF8000',
  'Aston Martin':      '#229971',
  'Alpine':            '#FF87BC',
  'Williams':          '#64C4FF',
  'RB':                '#6692FF',
  'Haas F1 Team':      '#B6BABD',
  'Kick Sauber':       '#52E252',
}

export const DRIVER_TEAM: Record<number, string> = {
  1:   'Red Bull Racing',
  11:  'Red Bull Racing',
  16:  'Ferrari',
  55:  'Ferrari',
  44:  'Mercedes',
  63:  'Mercedes',
  4:   'McLaren',
  81:  'McLaren',
  14:  'Aston Martin',
  18:  'Aston Martin',
  10:  'Alpine',
  31:  'Alpine',
  23:  'Williams',
  2:   'Williams',
  3:   'RB',
  22:  'RB',
  20:  'Haas F1 Team',
  27:  'Haas F1 Team',
  24:  'Kick Sauber',
  77:  'Kick Sauber',
}

export const COMPOUND_COLORS: Record<string, string> = {
  SOFT:          '#E8001D',
  MEDIUM:        '#FFB020',
  HARD:          '#F0F2F5',
  INTERMEDIATE:  '#23D18B',
  WET:           '#4DA3FF',
}

export const CONFIDENCE_COLORS: Record<string, string> = {
  High:   '#23D18B',
  Medium: '#FFB020',
  Low:    '#8A94A6',
}

export const RISK_COLORS: Record<string, string> = {
  High:   '#E8001D',
  Medium: '#FFB020',
  Low:    '#23D18B',
}

export const SEVERITY_COLORS: Record<string, string> = {
  High:   '#E8001D',
  Medium: '#FFB020',
  Low:    '#4DA3FF',
}

export const NOTE_TYPE_LABELS: Record<string, string> = {
  TYRE_DEGRADATION: 'TYRE DEG',
  UNDERCUT:         'UNDERCUT',
  PIT_IMPACT:       'PIT STOP',
  CHAOS:            'CHAOS',
  TRAFFIC:          'TRAFFIC',
  TRUE_PACE:        'TRUE PACE',
  WEATHER:          'WEATHER',
  ANOMALY:          'ANOMALY',
}

export const DEMO_RACES = [
  {
    session_key: 9636,
    meeting_key: 1241,
    meeting_name: 'Brazilian Grand Prix',
    country_name: 'Brazil',
    circuit_short_name: 'Interlagos',
    date_start: '2024-11-03',
    year: 2024,
    chaos_score: 94,
    tags: ['Extreme Chaos', 'Rain', 'Safety Car', 'VSC'],
  },
  {
    session_key: 9539,
    meeting_key: 1229,
    meeting_name: 'Spanish Grand Prix',
    country_name: 'Spain',
    circuit_short_name: 'Catalunya',
    date_start: '2024-06-23',
    year: 2024,
    chaos_score: 28,
    tags: ['Clean Race', 'Undercut Showcase', 'Strategic'],
  },
  {
    session_key: 9566,
    meeting_key: 1233,
    meeting_name: 'Hungarian Grand Prix',
    country_name: 'Hungary',
    circuit_short_name: 'Hungaroring',
    date_start: '2024-07-21',
    year: 2024,
    chaos_score: 41,
    tags: ['High Degradation', 'Tyre Strategy', 'Overcut'],
  },
] as const

export const LOADING_STEPS = [
  'Fetching timing data…',
  'Loading stints and pit data…',
  'Filtering clean laps…',
  'Reconstructing race timeline…',
  'Calculating tyre degradation slopes…',
  'Detecting pit stop impact…',
  'Computing chaos index…',
  'Generating engineer notes…',
] as const
