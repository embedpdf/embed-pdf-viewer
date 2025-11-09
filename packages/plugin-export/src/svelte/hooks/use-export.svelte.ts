import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { ExportPlugin } from '@embedpdf/plugin-export';

export const useExportPlugin = () => usePlugin<ExportPlugin>(ExportPlugin.id);
export const useExportCapability = () => useCapability<ExportPlugin>(ExportPlugin.id);

/**
 * Hook for export capability for a specific document
 * @param documentId Document ID
 */
export const useExport = (documentId: string) => {
  const capability = useExportCapability();

  const scopedProvides = $derived(capability.provides?.forDocument(documentId) ?? null);

  return {
    get provides() {
      return scopedProvides;
    },
  };
};
