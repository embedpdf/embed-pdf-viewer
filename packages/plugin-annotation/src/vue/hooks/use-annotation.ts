import { readonly, ref, watchEffect, computed, Ref } from 'vue';
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
 * @param documentId Document ID (can be a ref or plain string)
 */
export const useAnnotation = (documentId: Ref<string> | string) => {
  const { provides } = useAnnotationCapability();
  const state = ref<AnnotationDocumentState>(initialDocumentState());

  const docId = computed(() => (typeof documentId === 'string' ? documentId : documentId.value));

  watchEffect((onCleanup) => {
    if (provides.value && docId.value) {
      const scope = provides.value.forDocument(docId.value);

      // Get initial state
      state.value = scope.getState();

      // Subscribe to state changes
      const unsubscribe = scope.onStateChange((newState) => {
        state.value = newState;
      });
      onCleanup(unsubscribe);
    }
  });

  const scopedProvides = computed(() =>
    provides.value && docId.value ? provides.value.forDocument(docId.value) : null,
  );

  return {
    state: readonly(state),
    provides: scopedProvides,
  };
};
