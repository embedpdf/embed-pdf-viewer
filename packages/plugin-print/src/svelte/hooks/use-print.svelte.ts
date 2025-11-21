import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { PrintPlugin, PrintScope } from '@embedpdf/plugin-print';

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

// Define the return type explicitly to maintain type safety
interface UsePrintReturn {
  provides: PrintScope | null;
}

/**
 * Hook for print capability for a specific document
 * @param getDocumentId Function that returns the document ID
 */
export const usePrint = (getDocumentId: () => string | null): UsePrintReturn => {
  const capability = usePrintCapability();

  // Reactive documentId
  const documentId = $derived(getDocumentId());

  // Scoped capability for current docId
  const scopedProvides = $derived(
    capability.provides && documentId ? capability.provides.forDocument(documentId) : null,
  );

  return {
    get provides() {
      return scopedProvides;
    },
  };
};
