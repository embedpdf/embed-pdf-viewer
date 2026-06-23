import {
  DestroyRef,
  computed,
  inject,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import type { PDFViewerConfig, ThemeConfig, ThemePreference } from '@embedpdf/angular-pdf-viewer';

export const DEMO_DOCUMENT_URL = 'https://snippet.embedpdf.com/ebook.pdf';

export const ANGULAR_TAILWIND_THEME = {
  light: {
    accent: {
      primary: '#0f766e',
      primaryHover: '#115e59',
      primaryActive: '#134e4a',
      primaryLight: '#ccfbf1',
      primaryForeground: '#ffffff',
    },
  },
  dark: {
    accent: {
      primary: '#2dd4bf',
      primaryHover: '#5eead4',
      primaryActive: '#14b8a6',
      primaryLight: '#134e4a',
      primaryForeground: '#042f2e',
    },
  },
} satisfies Omit<ThemeConfig, 'preference'>;

export function createThemePreferenceSignal(): WritableSignal<ThemePreference> {
  const themePreference = signal<ThemePreference>('light');
  const destroyRef = inject(DestroyRef);

  if (typeof document === 'undefined') {
    return themePreference;
  }

  const html = document.documentElement;
  const updateTheme = () => {
    themePreference.set(html.classList.contains('dark') ? 'dark' : 'light');
  };

  updateTheme();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        updateTheme();
      }
    }
  });

  observer.observe(html, { attributes: true });
  destroyRef.onDestroy(() => observer.disconnect());

  return themePreference;
}

export function createThemeConfig(themePreference: Signal<ThemePreference>) {
  return computed(() => ({
    preference: themePreference(),
    ...ANGULAR_TAILWIND_THEME,
  }));
}

export function createDefaultViewerConfig(themePreference: Signal<ThemePreference>) {
  const theme = createThemeConfig(themePreference);
  return computed<PDFViewerConfig>(() => ({
    src: DEMO_DOCUMENT_URL,
    theme: theme(),
  }));
}
