import { ref, inject, provide, type InjectionKey, type Ref } from 'vue';

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

const AnchorRegistryKey: InjectionKey<AnchorRegistry> = Symbol('AnchorRegistry');

export function createAnchorRegistry(): AnchorRegistry {
  const anchors: Ref<Map<string, HTMLElement>> = ref(new Map());

  return {
    register(documentId: string, itemId: string, element: HTMLElement) {
      const key = `${documentId}:${itemId}`;
      anchors.value.set(key, element);
    },

    unregister(documentId: string, itemId: string) {
      const key = `${documentId}:${itemId}`;
      anchors.value.delete(key);
    },

    getAnchor(documentId: string, itemId: string) {
      const key = `${documentId}:${itemId}`;
      return anchors.value.get(key) || null;
    },
  };
}

export function provideAnchorRegistry() {
  const registry = createAnchorRegistry();
  provide(AnchorRegistryKey, registry);
  return registry;
}

export function useAnchorRegistry(): AnchorRegistry {
  const registry = inject(AnchorRegistryKey);
  if (!registry) {
    throw new Error('useAnchorRegistry must be used within UIProvider');
  }
  return registry;
}
