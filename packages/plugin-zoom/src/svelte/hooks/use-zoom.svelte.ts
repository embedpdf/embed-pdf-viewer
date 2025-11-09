import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import {
  initialDocumentState,
  ZoomDocumentState,
  ZoomPlugin,
  ZoomScope,
} from '@embedpdf/plugin-zoom';

export const useZoomCapability = () => useCapability<ZoomPlugin>(ZoomPlugin.id);
export const useZoomPlugin = () => usePlugin<ZoomPlugin>(ZoomPlugin.id);

// Define the return type explicitly to maintain type safety
interface UseZoomReturn {
  provides: ZoomScope | null;
  state: ZoomDocumentState;
}

/**
 * Hook for zoom state for a specific document
 * @param getDocumentId Function that returns the document ID
 */
export const useZoom = (getDocumentId: () => string | null): UseZoomReturn => {
  const capability = useZoomCapability();

  let state = $state<ZoomDocumentState>(initialDocumentState);

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
      state = initialDocumentState;
      return;
    }

    const scope = provides.forDocument(docId);

    // Get initial state
    state = scope.getState();

    // Subscribe to state changes for this document
    return scope.onStateChange((newState) => {
      state = newState;
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
