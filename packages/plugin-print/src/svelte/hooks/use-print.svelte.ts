import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { PrintPlugin } from '@embedpdf/plugin-print';

/**
 * Hook to get the raw print plugin instance.
 * Useful for accessing plugin-specific properties or methods not exposed in the capability.
 */
export const usePrintPlugin = () => usePlugin<PrintPlugin>(PrintPlugin.id);

/**
 * Hook to get the print plugin's capability API.
 * This provides methods for initiating print operations.
 */
export const usePrintCapability = () => useCapability<PrintPlugin>(PrintPlugin.id);

/**
 * Hook for print capability for a specific document
 * @param documentId Document ID
 */
export const usePrint = (documentId: string) => {
  const capability = usePrintCapability();

  const scopedProvides = $derived(capability.provides?.forDocument(documentId) ?? null);

  return {
    get provides() {
      return scopedProvides;
    },
  };
};
