import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import {
  SpreadMode,
  SpreadPlugin,
  initialDocumentState,
  SpreadScope,
} from '@embedpdf/plugin-spread';

/**
 * Hook to get the raw spread plugin instance.
 * Useful for accessing plugin-specific properties or methods not exposed in the capability.
 */
export const useSpreadPlugin = () => usePlugin<SpreadPlugin>(SpreadPlugin.id);

/**
 * Hook to get the spread plugin's capability API.
 * This provides methods for controlling spread mode.
 */
export const useSpreadCapability = () => useCapability<SpreadPlugin>(SpreadPlugin.id);

// Define the return type explicitly to maintain type safety
interface UseSpreadReturn {
  provides: SpreadScope | null;
  spreadMode: SpreadMode;
}

/**
 * Hook for spread state for a specific document
 * @param getDocumentId Function that returns the document ID
 */
export const useSpread = (getDocumentId: () => string | null): UseSpreadReturn => {
  const capability = useSpreadCapability();

  let spreadMode = $state<SpreadMode>(initialDocumentState.spreadMode);

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
      spreadMode = initialDocumentState.spreadMode;
      return;
    }

    const scope = provides.forDocument(docId);

    // Set initial spread mode
    spreadMode = scope.getSpreadMode();

    // Subscribe to spread mode changes for this document
    return scope.onSpreadChange((newSpreadMode) => {
      spreadMode = newSpreadMode;
    });
  });

  return {
    get provides() {
      return scopedProvides;
    },
    get spreadMode() {
      return spreadMode;
    },
  };
};
