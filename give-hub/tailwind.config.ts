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
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        'panel-2': 'var(--panel-2)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        primary: 'var(--primary)',
        'primary-600': 'var(--primary-600)',
        'primary-700': 'var(--primary-700)',
        accent: 'var(--accent)',
        ring: 'var(--ring)',
        eth: 'var(--eth)',
        sol: 'var(--sol)',
        btc: 'var(--btc)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontVariantNumeric: {
        'tabular-nums': 'tabular-nums',
      },
      borderRadius: {
        'base': '1.25rem',
        'xl': '2.5rem',
      },
      boxShadow: {
        'custom': '0 8px 24px rgba(0,0,0,.35)',
      },
    },
  },
  plugins: [],
}
export default config
