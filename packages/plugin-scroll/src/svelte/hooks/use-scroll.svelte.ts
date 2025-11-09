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
 * @param documentId Document ID
 */
export const useScroll = (documentId: string): UseScrollReturn => {
  const capability = useScrollCapability();

  let state = $state({
    currentPage: 1,
    totalPages: 1,
  });

  // Derived scoped capability for the specific document
  const scopedProvides = $derived(capability.provides?.forDocument(documentId) ?? null);

  $effect(() => {
    if (!capability.provides || !documentId) {
      state.currentPage = 1;
      state.totalPages = 1;
      return;
    }

    const scope = capability.provides.forDocument(documentId);

    // Get initial state
    state.currentPage = scope.getCurrentPage();
    state.totalPages = scope.getTotalPages();

    return capability.provides.onPageChange((event) => {
      if (event.documentId === documentId) {
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
