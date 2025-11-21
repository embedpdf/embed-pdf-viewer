import { ref, watch, computed, toValue, type MaybeRefOrGetter, Ref, ComputedRef } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import {
  SearchPlugin,
  SearchDocumentState,
  SearchScope,
  initialSearchDocumentState,
} from '@embedpdf/plugin-search';

export const useSearchPlugin = () => usePlugin<SearchPlugin>(SearchPlugin.id);
export const useSearchCapability = () => useCapability<SearchPlugin>(SearchPlugin.id);

/**
 * Hook for search state for a specific document
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export const useSearch = (
  documentId: MaybeRefOrGetter<string>,
): {
  state: Ref<SearchDocumentState>;
  provides: ComputedRef<SearchScope | null>;
} => {
  const { provides } = useSearchCapability();
  const searchState = ref<SearchDocumentState>(initialSearchDocumentState);

  watch(
    [provides, () => toValue(documentId)],
    ([providesValue, docId], _, onCleanup) => {
      if (!providesValue) {
        searchState.value = initialSearchDocumentState;
        return;
      }

      const scope = providesValue.forDocument(docId);

      // Set initial state
      searchState.value = scope.getState();

      // Subscribe to changes
      const unsubscribe = scope.onStateChange((state) => {
        searchState.value = state;
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
    state: searchState,
    provides: scopedProvides,
  };
};
