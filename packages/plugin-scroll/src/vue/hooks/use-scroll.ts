import { ref, watchEffect, computed, ComputedRef } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { ScrollPlugin, ScrollScope } from '@embedpdf/plugin-scroll';

export const useScrollPlugin = () => usePlugin<ScrollPlugin>(ScrollPlugin.id);
export const useScrollCapability = () => useCapability<ScrollPlugin>(ScrollPlugin.id);

// Define the return type explicitly to maintain type safety
interface UseScrollReturn {
  provides: ScrollScope | null;
  state: ComputedRef<{
    currentPage: number;
    totalPages: number;
  }>;
}

export function useScroll(documentId: string): UseScrollReturn {
  const { provides } = useScrollCapability();

  const currentPage = ref(1);
  const totalPages = ref(1);

  watchEffect((onCleanup) => {
    if (!provides.value || !documentId) return;

    const scope = provides.value.forDocument(documentId);
    currentPage.value = scope.getCurrentPage();
    totalPages.value = scope.getTotalPages();

    const unsubscribe = provides.value.onPageChange((event) => {
      if (event.documentId === documentId) {
        currentPage.value = event.pageNumber;
        totalPages.value = event.totalPages;
      }
    });
    onCleanup(unsubscribe);
  });

  const state = computed(() => ({
    currentPage: currentPage.value,
    totalPages: totalPages.value,
  }));

  return {
    provides: provides.value?.forDocument(documentId) ?? null,
    state,
  };
}
