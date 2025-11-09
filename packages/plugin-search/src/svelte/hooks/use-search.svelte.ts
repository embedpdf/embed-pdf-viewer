import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import {
  SearchPlugin,
  SearchDocumentState,
  SearchScope,
  initialSearchDocumentState,
} from '@embedpdf/plugin-search';

export const useSearchPlugin = () => usePlugin<SearchPlugin>(SearchPlugin.id);
export const useSearchCapability = () => useCapability<SearchPlugin>(SearchPlugin.id);

// Define the return type explicitly to maintain type safety
interface UseSearchReturn {
  provides: SearchScope | null;
  state: SearchDocumentState;
}

/**
 * Hook for search state for a specific document
 * @param getDocumentId Function that returns the document ID
 */
export const useSearch = (getDocumentId: () => string | null): UseSearchReturn => {
  const capability = useSearchCapability();

  let searchState = $state<SearchDocumentState>(initialSearchDocumentState);

  // Reactive documentId
  const documentId = $derived(getDocumentId());

  // Scoped capability for current docId
  const scopedProvides = $derived(
    capability.provides && documentId ? capability.provides.forDocument(documentId) : null,
  );

  $effect(() => {
    const provides = capability.provides;
    const docId = documentId;

    if (!provides || !docId) {
      searchState = initialSearchDocumentState;
      return;
    }

    const scope = provides.forDocument(docId);

    // Set initial state
    searchState = scope.getState();

    // Subscribe to changes
    return scope.onStateChange((state) => {
      searchState = state;
    });
  });

  return {
    get provides() {
      return scopedProvides;
    },
    get state() {
      return searchState;
    },
  };
};
