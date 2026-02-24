import {
  RedactionPlugin,
  initialDocumentState,
  RedactionDocumentState,
  RedactionScope,
} from '@embedpdf/plugin-redaction';
import { useCapability, usePlugin } from '@embedpdf/core/svelte';

export const useRedactionPlugin = () => usePlugin<RedactionPlugin>(RedactionPlugin.id);
export const useRedactionCapability = () => useCapability<RedactionPlugin>(RedactionPlugin.id);

// Define the return type explicitly to maintain type safety
interface UseRedactionReturn {
  provides: RedactionScope | null;
  state: RedactionDocumentState;
}

/**
 * Hook for redaction state for a specific document
 * @param getDocumentId Document ID getter function
 */
export const useRedaction = (getDocumentId: () => string | null): UseRedactionReturn => {
  const capability = useRedactionCapability();

  let state = $state<RedactionDocumentState>(initialDocumentState);

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
    try {
      state = scope.getState();
    } catch (e) {
      // Handle case where state might not be ready
      state = initialDocumentState;
    }

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
