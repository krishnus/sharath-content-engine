/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette — deep navy + warm gold
        ink: {
          950: '#050810',
          900: '#0a0e1a',
          800: '#111827',
          700: '#1c2333',
          600: '#253047',
          500: '#3b4a6b',
          400: '#5a6e94',
          300: '#8497bb',
        },
        gold: {
          600: '#a07828',
          500: '#c9a84c',
          400: '#dbbf6e',
          300: '#e8d494',
          200: '#f4e9c0',
          100: '#faf5e4',
        },
        cream: {
          DEFAULT: '#f0edd8',
          muted: '#c2bfad',
        },
        // Status colours
        status: {
          draft:     '#5a6e94',
          edited:    '#7c6fcd',
          approved:  '#4a9e6b',
          scheduled: '#c9a84c',
          published: '#2d8f6f',
          failed:    '#c94a4a',
          awaiting:  '#3b4a6b',
        },
        // Pillar colours
        pillar: {
          vedic:       '#8b5cf6',
          banker:      '#3b82f6',
          coaching:    '#10b981',
          financial:   '#f59e0b',
          inner:       '#ec4899',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body:    ['DM Sans', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'grain': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
      },
      animation: {
        'fade-up':   'fadeUp 0.4s ease-out forwards',
        'fade-in':   'fadeIn 0.3s ease-out forwards',
        'pulse-slow':'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
