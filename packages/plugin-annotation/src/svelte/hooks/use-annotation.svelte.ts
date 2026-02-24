import {
  AnnotationPlugin,
  AnnotationDocumentState,
  initialDocumentState,
  AnnotationScope,
} from '@embedpdf/plugin-annotation';
import { useCapability, usePlugin } from '@embedpdf/core/svelte';

export const useAnnotationCapability = () => useCapability<AnnotationPlugin>(AnnotationPlugin.id);
export const useAnnotationPlugin = () => usePlugin<AnnotationPlugin>(AnnotationPlugin.id);

// Define the return type explicitly to maintain type safety
interface UseAnnotationReturn {
  provides: AnnotationScope | null;
  state: AnnotationDocumentState;
}

/**
 * Hook for annotation state for a specific document
 * @param getDocumentId Document ID getter function
 */
export const useAnnotation = (getDocumentId: () => string | null): UseAnnotationReturn => {
  const capability = useAnnotationCapability();

  let state = $state<AnnotationDocumentState>(initialDocumentState());

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
      state = initialDocumentState();
      return;
    }

    const scope = provides.forDocument(docId);

    // Get initial state
    state = scope.getState();

    // Subscribe to state changes for THIS docId
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
