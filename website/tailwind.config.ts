import type { Config } from 'tailwindcss';

export default {
  // The docs-kit sources must be scanned too: its components carry Tailwind
  // classes that only exist in generated CSS if some content glob sees them.
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}', '../docs/kit/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // EmbedPDF brand tokens — from the design-system ui_kit (the Figma
        // brand-book direction). The kit's action blue is #0876FD.
        ep: {
          blue: '#0876FD',
          blue600: '#0660D6',
          blue700: '#0758B8',
          blue800: '#054FB3',
          sky: '#7DB6FF',
          purple: '#9747FF',
          navy: '#07204C',
          ink: '#1A2748',
          body: '#000E41',
          slate: '#3B4B7A',
          muted: '#4A5874',
          soft: '#5A6B92',
          subtle: '#6B7B9D',
          faint: '#8FA0C4',
          border: '#E6EAF2',
          borderSoft: '#E9EEFF',
          mist: '#ECF2FE',
          mistDeep: '#DCE8FC',
          tint: '#F3F7FE',
          bg: '#FBFCFE',
          codebg: '#0B1530',
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
