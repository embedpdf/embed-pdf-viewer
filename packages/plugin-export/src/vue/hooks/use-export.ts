import { computed } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { ExportPlugin } from '@embedpdf/plugin-export';

export const useExportPlugin = () => usePlugin<ExportPlugin>(ExportPlugin.id);
export const useExportCapability = () => useCapability<ExportPlugin>(ExportPlugin.id);

/**
 * Hook for export capability for a specific document
 * @param documentId Document ID
 */
export const useExport = (documentId: string) => {
  const { provides } = useExportCapability();

  // Return a computed ref for the scoped capability
  const scopedProvides = computed(() => provides.value?.forDocument(documentId) ?? null);

  return {
    provides: scopedProvides,
  };
};
