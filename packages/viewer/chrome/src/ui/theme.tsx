/**
 * Light/dark theme — a class toggled from the header; the CSS variables in
 * styles.css do the rest (both toolbars, sidebars, popovers, and the canvas
 * re-theme from one class). The class lands on <html> by default; a delivery
 * that must not touch the page (the <embedpdf-viewer> shadow root) passes
 * `target` and the class stays inside its own subtree. Authoritative over the
 * OS setting, matching the snippet's explicit theme switch.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

const ThemeCtx = createContext<{
  mode: ThemeMode;
  toggle: () => void;
  set: (m: ThemeMode) => void;
} | null>(null);

const systemMode = (): ThemeMode =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

export function ThemeProvider({
  children,
  preference = 'system',
  target,
}: {
  children: React.ReactNode;
  /** Initial mode; 'system' (default) follows the OS setting. */
  preference?: ThemePreference;
  /** Where the `.dark` class goes. Default: document.documentElement. */
  target?: HTMLElement | null;
}) {
  const [mode, setMode] = useState<ThemeMode>(() =>
    preference === 'system' ? systemMode() : preference,
  );
  useEffect(() => {
    (target ?? document.documentElement).classList.toggle('dark', mode === 'dark');
  }, [mode, target]);
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
