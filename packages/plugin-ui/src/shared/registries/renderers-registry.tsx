import { createContext, useContext } from '@framework';
import type { ReactNode } from '@framework';
import { UIRenderers } from '../types';

/**
 * Renderers Registry
 *
 * Provides access to user-supplied renderers (toolbar, panel, menu).
 */
const RenderersContext = createContext<UIRenderers | null>(null);

export interface RenderersProviderProps {
  children: ReactNode;
  renderers: UIRenderers;
}

export function RenderersProvider({ children, renderers }: RenderersProviderProps) {
  return <RenderersContext.Provider value={renderers}>{children}</RenderersContext.Provider>;
}

export function useRenderers(): UIRenderers {
  const context = useContext(RenderersContext);
  if (!context) {
    throw new Error('useRenderers must be used within UIProvider');
  }
  return context;
}
