import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { PanPlugin, initialDocumentState } from '@embedpdf/plugin-pan';

export const usePanPlugin = () => usePlugin<PanPlugin>(PanPlugin.id);
export const usePanCapability = () => useCapability<PanPlugin>(PanPlugin.id);

/**
 * Hook for pan state for a specific document
 * @param documentId Document ID
 */
export const usePan = (documentId: string) => {
  const capability = usePanCapability();

  let isPanning = $state(initialDocumentState.isPanMode);

  // Derived scoped capability for the specific document
  const scopedProvides = $derived(capability.provides?.forDocument(documentId) ?? null);

  $effect(() => {
    if (!capability.provides) {
      isPanning = initialDocumentState.isPanMode;
      return;
    }

    const scope = capability.provides.forDocument(documentId);

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
