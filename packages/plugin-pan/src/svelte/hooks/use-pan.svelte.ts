import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { PanPlugin, initialDocumentState, PanScope } from '@embedpdf/plugin-pan';

export const usePanPlugin = () => usePlugin<PanPlugin>(PanPlugin.id);
export const usePanCapability = () => useCapability<PanPlugin>(PanPlugin.id);

// Define the return type explicitly to maintain type safety
interface UsePanReturn {
  provides: PanScope | null;
  isPanning: boolean;
}

/**
 * Hook for pan state for a specific document
 * @param getDocumentId Function that returns the document ID
 */
export const usePan = (getDocumentId: () => string | null): UsePanReturn => {
  const capability = usePanCapability();

  let isPanning = $state(initialDocumentState.isPanMode);

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
      isPanning = initialDocumentState.isPanMode;
      return;
    }

    const scope = provides.forDocument(docId);

    // Set initial state
    isPanning = scope.isPanMode();

    // Subscribe to pan mode changes for this document
    return scope.onPanModeChange((isPan) => {
      isPanning = isPan;
    });
  });

  return {
    get provides() {
      return scopedProvides;
    },
    get isPanning() {
      return isPanning;
    },
  };
};
