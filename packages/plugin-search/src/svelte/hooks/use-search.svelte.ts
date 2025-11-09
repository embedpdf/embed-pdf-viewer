import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import {
  SearchPlugin,
  SearchDocumentState,
  SearchScope,
  initialSearchDocumentState,
} from '@embedpdf/plugin-search';

export const useSearchPlugin = () => usePlugin<SearchPlugin>(SearchPlugin.id);
export const useSearchCapability = () => useCapability<SearchPlugin>(SearchPlugin.id);

/**
 * Hook for search state for a specific document
 * @param documentId Document ID
 */
export const useSearch = (
  documentId: string,
): {
  state: SearchDocumentState;
  provides: SearchScope | null;
} => {
  const capability = useSearchCapability();

  let searchState = $state<SearchDocumentState>(initialSearchDocumentState);

  // Derived scoped provides for the specific document
  const scopedProvides = $derived(capability.provides?.forDocument(documentId) ?? null);

  $effect(() => {
    if (!scopedProvides) {
      searchState = initialSearchDocumentState;
      return;
    }

    // Set initial state
    searchState = scopedProvides.getState();

    // Subscribe to changes
    return scopedProvides.onStateChange((state) => {
      searchState = state;
    });
  });

  return {
    get state() {
      return searchState;
    },
    get provides() {
      return scopedProvides;
    },
  };
};
