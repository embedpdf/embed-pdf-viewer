import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { initialDocumentState, ZoomDocumentState, ZoomPlugin } from '@embedpdf/plugin-zoom';

export const useZoomCapability = () => useCapability<ZoomPlugin>(ZoomPlugin.id);
export const useZoomPlugin = () => usePlugin<ZoomPlugin>(ZoomPlugin.id);

/**
 * Hook for zoom state for a specific document
 * @param documentId Document ID
 */
export const useZoom = (documentId: string) => {
  const capability = useZoomCapability();

  let state = $state<ZoomDocumentState>(initialDocumentState);

  // Derived scoped capability for the specific document
  const scopedProvides = $derived(capability.provides?.forDocument(documentId) ?? null);

  $effect(() => {
    if (!capability.provides) {
      state = initialDocumentState;
      return;
    }

    const scope = capability.provides.forDocument(documentId);

    // Get initial state
    state = scope.getState();

    // Subscribe to state changes for this document
    return scope.onStateChange((newState) => {
      state = newState;
    });
  });

  return {
    get state() {
      return state;
    },
    get provides() {
      return scopedProvides;
    },
  };
};
