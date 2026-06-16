import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        base:    '#F6FAFD',
        surface: '#FFFFFF',
        border:  '#D4E4F0',
        navy: {
          950: '#060e1c',
          900: '#0A1931',
          800: '#112240',
          700: '#1A3D63',
          500: '#4A7FA7',
          300: '#7BAAC8',
          200: '#B3CFE5',
          100: '#E0EEF7',
        },
        brand: {
          50:  '#f0f7fd',
          100: '#daeaf6',
          200: '#B3CFE5',
          300: '#7BAAC8',
          400: '#4A7FA7',
          500: '#4A7FA7',
          600: '#1A3D63',
          700: '#0A1931',
        },
        // Keep legacy surface tokens so nothing breaks
        'surface-900': '#060e1c',
        'surface-800': '#0A1931',
        'surface-700': '#112240',
        'surface-600': '#1A3D63',
        'surface-500': '#1f4a76',
        'surface-400': '#4A7FA7',
        'surface-300': '#7BAAC8',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
        display: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        xs:  '0 1px 2px rgba(10,25,49,0.06)',
        sm:  '0 1px 4px rgba(10,25,49,0.08), 0 0 0 1px rgba(10,25,49,0.04)',
        md:  '0 4px 12px rgba(10,25,49,0.10), 0 1px 3px rgba(10,25,49,0.06)',
        lg:  '0 8px 24px rgba(10,25,49,0.12), 0 2px 6px rgba(10,25,49,0.06)',
        xl:  '0 16px 40px rgba(10,25,49,0.14), 0 4px 12px rgba(10,25,49,0.08)',
      },
      animation: {
        'fade-in':       'fadeIn 0.25s ease-out both',
        'slide-up':      'slideUp 0.3s ease-out both',
        'token-change':  'tokenChange 0.55s cubic-bezier(0.34,1.56,0.64,1) both',
        'pulse-slow':    'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'count-down':    'countDown 1s linear',
      },
      keyframes: {
        fadeIn:     { '0%': { opacity:'0' }, '100%': { opacity:'1' } },
        slideUp:    { '0%': { opacity:'0', transform:'translateY(10px)' }, '100%': { opacity:'1', transform:'translateY(0)' } },
        tokenChange:{ '0%': { opacity:'0', transform:'scale(0.8) translateY(18px)' }, '60%': { transform:'scale(1.04) translateY(-3px)' }, '100%': { opacity:'1', transform:'scale(1) translateY(0)' } },
        countDown:  { '0%': { opacity:'0.5' }, '100%': { opacity:'1' } },
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
      },
    },
  },
  plugins: [],
};

export default config;
