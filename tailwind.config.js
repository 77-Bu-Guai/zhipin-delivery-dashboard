/** @type {import('tailwindcss').Config} */

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        // 主色调 — 暖陶土
        accent: {
          50:  '#fdf5f1',
          100: '#fbe8de',
          200: '#f5ccb7',
          300: '#eda98a',
          400: '#e5835c',
          500: '#d9704a',  // 主色
          600: '#c45a38',
          700: '#a3462b',
          800: '#853b28',
          900: '#6e3424',
        },
        // 暖灰中性色
        warm: {
          50:  '#faf9f6',
          100: '#f3f1ec',
          200: '#e8e5dd',
          300: '#d4d0c7',
          400: '#b0aca0',
          500: '#8b877a',
          600: '#6b675b',
          700: '#545046',
          800: '#3d3a32',
          900: '#1f1d18',
        },
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans: ['"Noto Sans SC"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs':  ['0.625rem', { lineHeight: '0.875rem' }],   // 10px
        '3xl':  ['1.875rem', { lineHeight: '2.25rem' }],     // 30px
        '4xl':  ['2.25rem', { lineHeight: '2.75rem' }],      // 36px
        '5xl':  ['3rem', { lineHeight: '1.1' }],              // 48px
      },
      borderRadius: {
        'sm':    '0.375rem',
        'md':    '0.625rem',
        'lg':    '1rem',
        'xl':    '1.25rem',
        '2xl':   '1.5rem',
      },
      boxShadow: {
        'xs':    '0 1px 2px rgba(0,0,0,0.03)',
        'sm':    '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
        'md':    '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.04)',
        'lg':    '0 10px 15px -3px rgba(0,0,0,0.06), 0 4px 6px -4px rgba(0,0,0,0.04)',
        'xl':    '0 20px 25px -5px rgba(0,0,0,0.08), 0 8px 10px -6px rgba(0,0,0,0.04)',
        'inner': 'inset 0 2px 4px 0 rgba(0,0,0,0.04)',
        'glow':  '0 0 0 3px rgba(217, 112, 74, 0.12)',
      },
      animation: {
        'fade-in':     'fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up':    'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down':  'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in':    'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-soft':  'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer':     'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
