import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { SpreadMode, SpreadPlugin, initialDocumentState } from '@embedpdf/plugin-spread';

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

/**
 * Hook for spread state for a specific document
 * @param documentId Document ID
 */
export const useSpread = (documentId: string) => {
  const capability = useSpreadCapability();

  let spreadMode = $state<SpreadMode>(initialDocumentState.spreadMode);

  // Derived scoped capability for the specific document
  const scopedProvides = $derived(capability.provides?.forDocument(documentId) ?? null);

  $effect(() => {
    if (!capability.provides) {
      spreadMode = initialDocumentState.spreadMode;
      return;
    }

    const scope = capability.provides.forDocument(documentId);

    // Set initial spread mode
    spreadMode = scope.getSpreadMode();

    // Subscribe to spread mode changes for this document
    return scope.onSpreadChange((newSpreadMode) => {
      spreadMode = newSpreadMode;
    });
  });

  return {
    get spreadMode() {
      return spreadMode;
    },
    get provides() {
      return scopedProvides;
    },
  };
};
