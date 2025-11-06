import { ref, watch, computed, readonly, toValue, MaybeRefOrGetter } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { PanPlugin, initialDocumentState } from '@embedpdf/plugin-pan';

export const usePanPlugin = () => usePlugin<PanPlugin>(PanPlugin.id);
export const usePanCapability = () => useCapability<PanPlugin>(PanPlugin.id);

/**
 * Hook for pan state for a specific document
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export const usePan = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = usePanCapability();
  const isPanning = ref(initialDocumentState.isPanMode);

  watch(
    [provides, () => toValue(documentId)],
    ([providesValue, docId], _, onCleanup) => {
      if (!providesValue) {
        isPanning.value = initialDocumentState.isPanMode;
        return;
      }

      const scope = providesValue.forDocument(docId);

      // Set initial state
      isPanning.value = scope.isPanMode();

      // Subscribe to pan mode changes
      const unsubscribe = scope.onPanModeChange((isPan) => {
        isPanning.value = isPan;
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  // Return a computed ref for the scoped capability
  const scopedProvides = computed(() => {
    const docId = toValue(documentId);
    return provides.value?.forDocument(docId) ?? null;
  });

  return {
    provides: scopedProvides,
    isPanning: readonly(isPanning),
  };
};
