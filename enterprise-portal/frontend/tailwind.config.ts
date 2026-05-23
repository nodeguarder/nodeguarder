import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        portal: {
          bg: '#0b0f1a',
          card: '#161b2c',
          sidebar: '#1e293b',
          accent: '#6366f1',
          'accent-hover': '#818cf8',
          text: '#f1f5f9',
          'text-muted': '#94a3b8',
          border: '#2d364f',
          danger: '#ef4444',
          success: '#10b981',
          warning: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
