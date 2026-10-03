import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Colours are CSS variables (RGB channels) so a subtree can re-theme
      // every existing component at once — the /preview redesign does, via
      // .pw-modern in globals.css. :root holds today's palette, unchanged.
      colors: {
        bg: {
          primary:   'rgb(var(--c-bg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--c-bg-secondary) / <alpha-value>)',
          panel:     'rgb(var(--c-bg-panel) / <alpha-value>)',
          elevated:  'rgb(var(--c-bg-elevated) / <alpha-value>)',
        },
        border: {
          subtle:  'rgb(var(--c-border-subtle) / <alpha-value>)',
          default: 'rgb(var(--c-border-default) / <alpha-value>)',
        },
        text: {
          primary:   'rgb(var(--c-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--c-text-secondary) / <alpha-value>)',
          muted:     'rgb(var(--c-text-muted) / <alpha-value>)',
        },
        signal: {
          green:  'rgb(var(--c-signal-green) / <alpha-value>)',
          amber:  'rgb(var(--c-signal-amber) / <alpha-value>)',
          red:    'rgb(var(--c-signal-red) / <alpha-value>)',
          blue:   'rgb(var(--c-signal-blue) / <alpha-value>)',
          purple: 'rgb(var(--c-signal-purple) / <alpha-value>)',
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
