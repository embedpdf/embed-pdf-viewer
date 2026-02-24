import { getContext, setContext } from 'svelte';

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

const ANCHOR_REGISTRY_KEY = Symbol('AnchorRegistry');

export function createAnchorRegistry(): AnchorRegistry {
  const anchors = new Map<string, HTMLElement>();

  return {
    register(documentId: string, itemId: string, element: HTMLElement) {
      const key = `${documentId}:${itemId}`;
      anchors.set(key, element);
    },

    unregister(documentId: string, itemId: string) {
      const key = `${documentId}:${itemId}`;
      anchors.delete(key);
    },

    getAnchor(documentId: string, itemId: string) {
      const key = `${documentId}:${itemId}`;
      return anchors.get(key) || null;
    },
  };
}

export function provideAnchorRegistry() {
  const registry = createAnchorRegistry();
  setContext(ANCHOR_REGISTRY_KEY, registry);
  return registry;
}

export function useAnchorRegistry(): AnchorRegistry {
  const registry = getContext<AnchorRegistry>(ANCHOR_REGISTRY_KEY);
  if (!registry) {
    throw new Error('useAnchorRegistry must be used within UIProvider');
  }
  return registry;
}
