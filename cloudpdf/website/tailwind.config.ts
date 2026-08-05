import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // CloudPDF brand tokens (from the design system colors_and_type.css)
        cp: {
          blue: '#1677FF',
          blue600: '#0F62E0',
          blue700: '#0B4FB8',
          navy: '#0A1A4D',
          navyDeep: '#031E50',
          ink: '#29375E',
          muted: '#5A6B92',
          border: '#E4EAF4',
          borderSoft: '#EAF0FA',
          violet: '#7C5CFC',
          violet600: '#6A4AF0',
          violetDeep: '#5B3FE0',
          bg: '#FBFCFE',
          surface: '#ECF2FE',
        },
        // Repoint the existing `primary` ramp to the CloudPDF blue so the
        // existing docs components (which use primary-*) rebrand automatically.
        primary: {
          50: '#ECF2FE',
          100: '#E7F0FF',
          200: '#C7DEFF',
          300: '#97C9FD',
          400: '#4F9BFF',
          500: '#1677FF',
          600: '#0F62E0',
          700: '#0B4FB8',
          800: '#0A1A4D',
          900: '#031E50',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
    },
  },
} satisfies Config;
