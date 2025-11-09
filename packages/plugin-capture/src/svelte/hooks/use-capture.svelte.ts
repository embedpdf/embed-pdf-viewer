import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import {
  CapturePlugin,
  CaptureDocumentState,
  initialDocumentState,
  CaptureScope,
} from '@embedpdf/plugin-capture';

export const useCaptureCapability = () => useCapability<CapturePlugin>(CapturePlugin.id);
export const useCapturePlugin = () => usePlugin<CapturePlugin>(CapturePlugin.id);

// Define the return type explicitly to maintain type safety
interface UseCaptureReturn {
  provides: CaptureScope | null;
  state: CaptureDocumentState;
}

/**
 * Hook for capture state for a specific document
 * @param getDocumentId Function that returns the document ID
 */
export const useCapture = (getDocumentId: () => string | null): UseCaptureReturn => {
  const capability = useCaptureCapability();

  let state = $state<CaptureDocumentState>(initialDocumentState);

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
