import { useCapability, usePlugin } from '@embedpdf/core/vue';
import {
  CapturePlugin,
  CaptureDocumentState,
  initialDocumentState,
} from '@embedpdf/plugin-capture';
import { ref, watch, toValue, MaybeRefOrGetter, computed } from 'vue';

export const useCaptureCapability = () => useCapability<CapturePlugin>(CapturePlugin.id);
export const useCapturePlugin = () => usePlugin<CapturePlugin>(CapturePlugin.id);

/**
 * Hook for capture state for a specific document
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export const useCapture = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = useCaptureCapability();
  const state = ref<CaptureDocumentState>(initialDocumentState);

  watch(
    [provides, () => toValue(documentId)],
    ([providesValue, docId], _, onCleanup) => {
      if (providesValue && docId) {
        const scope = providesValue.forDocument(docId);
        state.value = scope.getState();

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
    provides: computed(() => provides.value?.forDocument(toValue(documentId)) ?? null),
  };
};
