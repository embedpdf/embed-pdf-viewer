import { computed, MaybeRefOrGetter, toValue } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { ExportPlugin } from '@embedpdf/plugin-export';

export const useExportPlugin = () => usePlugin<ExportPlugin>(ExportPlugin.id);
export const useExportCapability = () => useCapability<ExportPlugin>(ExportPlugin.id);

/**
 * Hook for export capability for a specific document
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export const useExport = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = useExportCapability();

  return {
    provides: computed(() => provides.value?.forDocument(toValue(documentId)) ?? null),
  };
};
