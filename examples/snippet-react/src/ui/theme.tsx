/**
 * Light/dark theme — a class on <html>, toggled from the header. The CSS
 * variables in index.css do the rest (both toolbars, sidebars, popovers, and
 * the canvas re-theme from one class). Authoritative over the OS setting,
 * matching the snippet's explicit theme switch.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

const ThemeCtx = createContext<{
  mode: ThemeMode;
  toggle: () => void;
  set: (m: ThemeMode) => void;
} | null>(null);

const initialMode = (): ThemeMode =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', mode === 'dark');
  }, [mode]);
  const value = useMemo(
    () => ({ mode, toggle: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')), set: setMode }),
    [mode],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
