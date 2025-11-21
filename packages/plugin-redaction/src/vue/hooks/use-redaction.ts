import { ref, watch, computed, toValue, type MaybeRefOrGetter, ComputedRef, Ref } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import {
  RedactionPlugin,
  initialDocumentState,
  RedactionDocumentState,
  RedactionScope,
} from '@embedpdf/plugin-redaction';

export const useRedactionPlugin = () => usePlugin<RedactionPlugin>(RedactionPlugin.id);
export const useRedactionCapability = () => useCapability<RedactionPlugin>(RedactionPlugin.id);

/**
 * Hook for redaction state for a specific document
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export const useRedaction = (
  documentId: MaybeRefOrGetter<string>,
): {
  state: Readonly<Ref<RedactionDocumentState>>;
  provides: ComputedRef<RedactionScope | null>;
} => {
  const { provides } = useRedactionCapability();
  const state = ref<RedactionDocumentState>(initialDocumentState);

  watch(
    [provides, () => toValue(documentId)],
    ([providesValue, docId], _, onCleanup) => {
      if (!providesValue) {
        state.value = initialDocumentState;
        return;
      }

      const scope = providesValue.forDocument(docId);

      // Set initial state
      try {
        state.value = scope.getState();
      } catch (e) {
        // Handle case where state might not be ready
        state.value = initialDocumentState;
      }

      // Subscribe to changes
      const unsubscribe = scope.onStateChange((newState) => {
        state.value = newState;
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  const scopedProvides = computed(() => {
    const docId = toValue(documentId);
    return provides.value?.forDocument(docId) ?? null;
  });

  return {
    state,
    provides: scopedProvides,
  };
};
