import { ref, watchEffect, readonly } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { initialDocumentState, ZoomPlugin, ZoomDocumentState } from '@embedpdf/plugin-zoom';

export const useZoomCapability = () => useCapability<ZoomPlugin>(ZoomPlugin.id);
export const useZoomPlugin = () => usePlugin<ZoomPlugin>(ZoomPlugin.id);

/**
 * Hook for zoom state for a specific document
 * @param documentId Document ID
 */
export const useZoom = (documentId: string) => {
  const { provides } = useZoomCapability();
  const state = ref<ZoomDocumentState>(initialDocumentState);

  watchEffect((onCleanup) => {
    if (provides.value) {
      const scope = provides.value.forDocument(documentId);

      // Get initial state
      state.value = scope.getState();

      // Subscribe to state changes
      const unsubscribe = scope.onStateChange((newState) => {
        state.value = newState;
      });
      onCleanup(unsubscribe);
    }
  });

  return {
    state: readonly(state),
    provides: provides.value?.forDocument(documentId) ?? null,
  };
};
