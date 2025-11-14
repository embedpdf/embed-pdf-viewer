import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { ScrollPlugin, ScrollScope } from '@embedpdf/plugin-scroll';

export const useScrollPlugin = () => usePlugin<ScrollPlugin>(ScrollPlugin.id);
export const useScrollCapability = () => useCapability<ScrollPlugin>(ScrollPlugin.id);

// Define the return type explicitly to maintain type safety
interface UseScrollReturn {
  provides: ScrollScope | null;
  state: {
    currentPage: number;
    totalPages: number;
  };
}

/**
 * Hook for scroll state for a specific document
 * @param documentId Document ID.
 */
export const useScroll = (getDocumentId: () => string | null): UseScrollReturn => {
  const capability = useScrollCapability();

  let state = $state({
    currentPage: 1,
    totalPages: 1,
  });

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
      state.currentPage = 1;
      state.totalPages = 1;
      return;
    }

    const scope = provides.forDocument(docId);

    // Initial values
    state.currentPage = scope.getCurrentPage();
    state.totalPages = scope.getTotalPages();

    // Subscribe to page changes for THIS docId
    return provides.onPageChange((event) => {
      if (event.documentId === docId) {
        state.currentPage = event.pageNumber;
        state.totalPages = event.totalPages;
      }
    });
  });

  return {
    get provides() {
      return scopedProvides;
    },
    get state() {
      return state;
    },
  };
};
