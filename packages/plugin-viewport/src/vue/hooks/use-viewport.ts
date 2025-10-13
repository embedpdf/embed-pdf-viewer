import { ref, watch } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { ScrollActivity, ViewportPlugin } from '@embedpdf/plugin-viewport';

export const useViewportPlugin = () => usePlugin<ViewportPlugin>(ViewportPlugin.id);
export const useViewportCapability = () => useCapability<ViewportPlugin>(ViewportPlugin.id);

/**
 * Hook to get scroll activity for a specific document
 * @param documentId Optional document ID. If not provided, listens to all documents.
 */
export const useViewportScrollActivity = (documentId?: string) => {
  const { provides } = useViewportCapability();
  const scrollActivity = ref<ScrollActivity>({
    isSmoothScrolling: false,
    isScrolling: false,
  });

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (providesValue) {
        const unsubscribe = providesValue.onScrollActivity((event) => {
          // Filter by documentId if provided
          if (!documentId || event.documentId === documentId) {
            scrollActivity.value = event.activity;
          }
        });
        onCleanup(unsubscribe);
      }
    },
    { immediate: true },
  );

  return scrollActivity;
};
