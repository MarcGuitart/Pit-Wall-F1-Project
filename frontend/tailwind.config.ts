import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary:   '#05060A',
          secondary: '#0B0D12',
          panel:     '#111419',
          elevated:  '#181C23',
        },
        border: {
          subtle:  '#1E2430',
          default: '#252D3A',
        },
        text: {
          primary:   '#F0F2F5',
          secondary: '#8A94A6',
          muted:     '#4A5568',
        },
        signal: {
          green:  '#23D18B',
          amber:  '#FFB020',
          red:    '#E8001D',
          blue:   '#4DA3FF',
          purple: '#A66CFF',
        },
      },
      fontFamily: {
        display: ['var(--font-barlow-condensed)', 'sans-serif'],
        body:    ['var(--font-barlow)', 'sans-serif'],
        mono:    ['var(--font-jetbrains-mono)', 'monospace'],
      },
      backgroundImage: {
        'grid-pattern': `linear-gradient(rgba(30,36,48,0.4) 1px, transparent 1px),
                         linear-gradient(90deg, rgba(30,36,48,0.4) 1px, transparent 1px)`,
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
    },
  },
  plugins: [],
}

export default config
