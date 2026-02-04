import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { ExportPlugin, ExportScope } from '@embedpdf/plugin-export';

export const useExportPlugin = () => usePlugin<ExportPlugin>(ExportPlugin.id);
export const useExportCapability = () => useCapability<ExportPlugin>(ExportPlugin.id);

// Define the return type explicitly to maintain type safety
interface UseExportReturn {
  provides: ExportScope | null;
}

/**
 * Hook for export capability for a specific document
 * @param getDocumentId Function that returns the document ID
 */
export const useExport = (getDocumentId: () => string | null): UseExportReturn => {
  const capability = useExportCapability();

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
