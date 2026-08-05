/**
 * The resolved customization, as React context. The chrome schema and the
 * user's extra icons are RESOLVED ONCE in <FullViewer> and read here by the
 * shell, menus, and strips — no component imports the default schema value
 * directly, so "the host replaced the chrome" is invisible below this line.
 *
 * The default context value is the default config: components render correctly
 * in tests and stories without a provider.
 */
import { createContext, useContext } from 'react';
import type { BarSchema, ChromeSchema, MenuSchema } from '@embedpdf/react/toolbar';
import { defaultChrome, getMenu, getModeBar, getStrip } from './config/chrome';
import type { IconDef } from './ui/icons';

export interface ResolvedViewerConfig {
  readonly chrome: ChromeSchema;
  /** User-registered icons — additive over the built-in set. */
  readonly icons: Readonly<Record<string, IconDef>>;
}

const DEFAULT_CONFIG: ResolvedViewerConfig = { chrome: defaultChrome, icons: {} };

const ViewerConfigContext = createContext<ResolvedViewerConfig>(DEFAULT_CONFIG);

export const ViewerConfigProvider = ViewerConfigContext.Provider;

export function useChromeSchema(): ChromeSchema {
  return useContext(ViewerConfigContext).chrome;
}

export function useMenuSchema(id: string): MenuSchema | undefined {
  return getMenu(useContext(ViewerConfigContext).chrome, id);
}

export function useModeBarSchema(id: string): BarSchema | undefined {
  return getModeBar(useContext(ViewerConfigContext).chrome, id);
}

export function useStripSchema(id: string): BarSchema | undefined {
  return getStrip(useContext(ViewerConfigContext).chrome, id);
}

export function useCustomIcons(): Readonly<Record<string, IconDef>> {
  return useContext(ViewerConfigContext).icons;
}
