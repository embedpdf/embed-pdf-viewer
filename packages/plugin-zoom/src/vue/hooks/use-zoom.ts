import { ref, watch, readonly, computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { initialDocumentState, ZoomPlugin, ZoomDocumentState } from '@embedpdf/plugin-zoom';

export const useZoomCapability = () => useCapability<ZoomPlugin>(ZoomPlugin.id);
export const useZoomPlugin = () => usePlugin<ZoomPlugin>(ZoomPlugin.id);

/**
 * Hook for zoom state for a specific document
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export const useZoom = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = useZoomCapability();
  const state = ref<ZoomDocumentState>(initialDocumentState);

  watch(
    [provides, () => toValue(documentId)],
    ([providesValue, docId], _, onCleanup) => {
      if (!providesValue) {
        state.value = initialDocumentState;
        return;
      }

      const scope = providesValue.forDocument(docId);

      // Get initial state
      state.value = scope.getState();

      // Subscribe to state changes
      const unsubscribe = scope.onStateChange((newState) => {
        state.value = newState;
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
    state: readonly(state),
    provides: scopedProvides,
  };
};
