import { ref, watch, computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import {
  AnnotationPlugin,
  AnnotationDocumentState,
  initialDocumentState,
} from '@embedpdf/plugin-annotation';

export const useAnnotationPlugin = () => usePlugin<AnnotationPlugin>(AnnotationPlugin.id);
export const useAnnotationCapability = () => useCapability<AnnotationPlugin>(AnnotationPlugin.id);

/**
 * Hook for annotation state for a specific document
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export const useAnnotation = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = useAnnotationCapability();
  const state = ref<AnnotationDocumentState>(
    provides?.value?.forDocument(toValue(documentId))?.getState() ?? initialDocumentState(),
  );

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
