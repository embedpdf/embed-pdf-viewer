import { useCapability, usePlugin } from '@embedpdf/core/vue';
import {
  CapturePlugin,
  CaptureDocumentState,
  initialDocumentState,
} from '@embedpdf/plugin-capture';
import { ref, watch, Ref } from 'vue';

export const useCaptureCapability = () => useCapability<CapturePlugin>(CapturePlugin.id);
export const useCapturePlugin = () => usePlugin<CapturePlugin>(CapturePlugin.id);

/**
 * Hook for capture state for a specific document
 * @param documentId Document ID
 */
export const useCapture = (documentId: Ref<string> | string) => {
  const { provides } = useCaptureCapability();
  const state = ref<CaptureDocumentState>(initialDocumentState);

  watch(
    [provides, () => (typeof documentId === 'string' ? documentId : documentId.value)],
    ([providesValue, docId], _, onCleanup) => {
      if (providesValue && docId) {
        const scope = providesValue.forDocument(docId);

        // Get initial state
        state.value = scope.getState();

        // Subscribe to state changes
        const unsubscribe = scope.onStateChange((newState) => {
          state.value = newState;
        });
        onCleanup(unsubscribe);
      }
    },
    { immediate: true },
  );

  return {
    state,
    provides,
  };
};
