import { createContext, useContext, useRef, useCallback } from '@framework';
import type { ReactNode } from '@framework';

/**
 * Anchor Registry
 *
 * Tracks DOM elements for menu positioning.
 * Each anchor is scoped by documentId and itemId.
 */
export interface AnchorRegistry {
  register(documentId: string, itemId: string, element: HTMLElement): void;
  unregister(documentId: string, itemId: string): void;
  getAnchor(documentId: string, itemId: string): HTMLElement | null;
}

const AnchorRegistryContext = createContext<AnchorRegistry | null>(null);

export function AnchorRegistryProvider({ children }: { children: ReactNode }) {
  const anchorsRef = useRef<Map<string, HTMLElement>>(new Map());

  const registry: AnchorRegistry = {
    register: useCallback((documentId: string, itemId: string, element: HTMLElement) => {
      const key = `${documentId}:${itemId}`;
      anchorsRef.current.set(key, element);
    }, []),

    unregister: useCallback((documentId: string, itemId: string) => {
      const key = `${documentId}:${itemId}`;
      anchorsRef.current.delete(key);
    }, []),

    getAnchor: useCallback((documentId: string, itemId: string) => {
      const key = `${documentId}:${itemId}`;
      return anchorsRef.current.get(key) || null;
    }, []),
  };

  return (
    <AnchorRegistryContext.Provider value={registry}>{children}</AnchorRegistryContext.Provider>
  );
}

export function useAnchorRegistry(): AnchorRegistry {
  const context = useContext(AnchorRegistryContext);
  if (!context) {
    throw new Error('useAnchorRegistry must be used within UIProvider');
  }
  return context;
}
