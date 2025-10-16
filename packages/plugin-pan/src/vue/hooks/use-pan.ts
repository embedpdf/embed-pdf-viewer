import { ref, watch, computed, readonly } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { PanPlugin, initialDocumentState } from '@embedpdf/plugin-pan';

export const usePanPlugin = () => usePlugin<PanPlugin>(PanPlugin.id);
export const usePanCapability = () => useCapability<PanPlugin>(PanPlugin.id);

/**
 * Hook for pan state for a specific document
 * @param documentId Document ID
 */
export const usePan = (documentId: string) => {
  const { provides } = usePanCapability();
  const isPanning = ref(initialDocumentState.isPanMode);

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (providesValue) {
        const scope = providesValue.forDocument(documentId);

        // Set initial state
        isPanning.value = scope.isPanMode();

        // Subscribe to pan mode changes
        const unsubscribe = scope.onPanModeChange((isPan) => {
          isPanning.value = isPan;
        });
        onCleanup(unsubscribe);
      }
    },
    { immediate: true },
  );

  // Return a computed ref for the scoped capability
  const scopedProvides = computed(() => provides.value?.forDocument(documentId) ?? null);

  return {
    provides: scopedProvides,
    isPanning: readonly(isPanning),
  };
};
