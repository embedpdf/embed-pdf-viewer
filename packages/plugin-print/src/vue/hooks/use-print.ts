import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { PrintPlugin } from '@embedpdf/plugin-print';
import { computed } from 'vue';

export const usePrintPlugin = () => usePlugin<PrintPlugin>(PrintPlugin.id);
export const usePrintCapability = () => useCapability<PrintPlugin>(PrintPlugin.id);

/**
 * Hook for print capability for a specific document
 * @param documentId Document ID
 */
export const usePrint = (documentId: string) => {
  const { provides } = usePrintCapability();

  // Return a computed ref for the scoped capability
  const scopedProvides = computed(() => provides.value?.forDocument(documentId) ?? null);

  return {
    provides: scopedProvides,
  };
};
