import { createContext, useContext, useRef, ReactNode, useCallback } from 'react';

/**
 * Anchor Registry
 *
 * Tracks DOM elements for command buttons so menus can anchor to them.
 * Each command button registers itself when it mounts, allowing the menu
 * system to look up anchor elements based on document ID and command/item IDs.
 *
 * This is scoped by documentId to support multiple documents/views.
 */

interface AnchorRegistry {
  register(documentId: string, itemId: string, element: HTMLElement): void;
  unregister(documentId: string, itemId: string): void;
  getAnchor(documentId: string, itemId: string): HTMLElement | null;
}

const AnchorRegistryContext = createContext<AnchorRegistry | null>(null);

export function AnchorRegistryProvider({ children }: { children: ReactNode }) {
  const anchorsRef = useRef<Map<string, HTMLElement>>(new Map());

  const register = useCallback((documentId: string, itemId: string, element: HTMLElement) => {
    const key = `${documentId}:${itemId}`;
    anchorsRef.current.set(key, element);
  }, []);

  const unregister = useCallback((documentId: string, itemId: string) => {
    const key = `${documentId}:${itemId}`;
    anchorsRef.current.delete(key);
  }, []);

  const getAnchor = useCallback((documentId: string, itemId: string): HTMLElement | null => {
    const key = `${documentId}:${itemId}`;
    return anchorsRef.current.get(key) || null;
  }, []);

  const registry: AnchorRegistry = { register, unregister, getAnchor };

  return (
    <AnchorRegistryContext.Provider value={registry}>{children}</AnchorRegistryContext.Provider>
  );
}

export function useAnchorRegistry(): AnchorRegistry {
  const context = useContext(AnchorRegistryContext);
  if (!context) {
    throw new Error('useAnchorRegistry must be used within AnchorRegistryProvider');
  }
  return context;
}
