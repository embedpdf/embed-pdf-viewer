/**
 * Light/dark theme — one class, and the CSS variables in styles.css do the
 * rest (both toolbars, sidebars, popovers, and the canvas re-theme from it).
 * The mode follows the embedder's `theme` preference while the viewer runs;
 * `'system'` follows the OS setting, and switches when the user changes it.
 * The class lands on <html> by default; a delivery that must not touch the
 * page (the <embedpdf-viewer> shadow root) passes `target` and the class stays
 * inside its own subtree.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

const ThemeCtx = createContext<{ mode: ThemeMode } | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

const systemMode = (): ThemeMode =>
  typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';

export function ThemeProvider({
  children,
  preference = 'system',
  target,
}: {
  children: React.ReactNode;
  /** The mode, or 'system' (default) to follow the OS setting. */
  preference?: ThemePreference;
  /** Where the `.dark` class goes. Default: document.documentElement. */
  target?: HTMLElement | null;
}) {
  const [system, setSystem] = useState<ThemeMode>(systemMode);
  useEffect(() => {
    if (preference !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia(DARK_QUERY);
    const follow = () => setSystem(query.matches ? 'dark' : 'light');
    follow();
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, [preference]);
  const mode = preference === 'system' ? system : preference;
  // Before the paint, so the viewer never shows a frame in the other mode.
  useLayoutEffect(() => {
    (target ?? document.documentElement).classList.toggle('dark', mode === 'dark');
  }, [mode, target]);
  const value = useMemo(() => ({ mode }), [mode]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

/** The mode the viewer shows now. */
export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
