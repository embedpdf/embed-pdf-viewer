import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { PrintPlugin } from '@embedpdf/plugin-print';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

export const usePrintPlugin = () => usePlugin<PrintPlugin>(PrintPlugin.id);
export const usePrintCapability = () => useCapability<PrintPlugin>(PrintPlugin.id);

/**
 * Hook for print capability for a specific document
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export const usePrint = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = usePrintCapability();

  // Return a computed ref for the scoped capability
  const scopedProvides = computed(() => {
    const docId = toValue(documentId);
    return provides.value?.forDocument(docId) ?? null;
  });

  return {
    provides: scopedProvides,
  };
};
