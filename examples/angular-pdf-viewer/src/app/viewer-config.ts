import type { PDFViewerConfig, ThemeConfig } from '@embedpdf/angular-pdf-viewer';

export const ANGULAR_THEME = {
  light: {
    accent: {
      primary: '#dd0031',
      primaryHover: '#c3002f',
      primaryActive: '#a8002a',
      primaryLight: '#ffe5eb',
      primaryForeground: '#ffffff',
    },
  },
  dark: {
    accent: {
      primary: '#ff5c7c',
      primaryHover: '#ff7a94',
      primaryActive: '#ff4568',
      primaryLight: '#55111f',
      primaryForeground: '#17050a',
    },
  },
} satisfies Omit<ThemeConfig, 'preference'>;

export const ANGULAR_VIEWER_DEFAULT_CONFIG = {
  theme: {
    preference: 'dark',
    ...ANGULAR_THEME,
  },
} satisfies PDFViewerConfig;
