import { ref, watch, computed, toValue, type MaybeRefOrGetter, type ComputedRef } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { ScrollPlugin, ScrollScope } from '@embedpdf/plugin-scroll';

export const useScrollPlugin = () => usePlugin<ScrollPlugin>(ScrollPlugin.id);
export const useScrollCapability = () => useCapability<ScrollPlugin>(ScrollPlugin.id);

// Define the return type explicitly to maintain type safety
interface UseScrollReturn {
  provides: ComputedRef<ScrollScope | null>;
  state: ComputedRef<{
    currentPage: number;
    totalPages: number;
  }>;
}

/**
 * Hook for scroll state for a specific document
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export function useScroll(documentId: MaybeRefOrGetter<string>): UseScrollReturn {
  const { provides } = useScrollCapability();

  const currentPage = ref(1);
  const totalPages = ref(1);

  watch(
    [provides, () => toValue(documentId)],
    ([providesValue, docId], _, onCleanup) => {
      if (!providesValue || !docId) {
        currentPage.value = 1;
        totalPages.value = 1;
        return;
      }

      const scope = providesValue.forDocument(docId);

      // Get initial state
      currentPage.value = scope.getCurrentPage();
      totalPages.value = scope.getTotalPages();

      const unsubscribe = providesValue.onPageChange((event) => {
        if (event.documentId === docId) {
          currentPage.value = event.pageNumber;
          totalPages.value = event.totalPages;
        }
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  const state = computed(() => ({
    currentPage: currentPage.value,
    totalPages: totalPages.value,
  }));

  // Return a computed ref for the scoped capability
  const scopedProvides = computed(() => {
    const docId = toValue(documentId);
    return provides.value?.forDocument(docId) ?? null;
  });

  return {
    provides: scopedProvides,
    state,
  };
}
