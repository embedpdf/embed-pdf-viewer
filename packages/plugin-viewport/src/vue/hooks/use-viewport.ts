import { ref, watch } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { GateChangeEvent, ScrollActivity, ViewportPlugin } from '@embedpdf/plugin-viewport';

export const useViewportPlugin = () => usePlugin<ViewportPlugin>(ViewportPlugin.id);
export const useViewportCapability = () => useCapability<ViewportPlugin>(ViewportPlugin.id);

/**
 * Hook to get the gated state of the viewport for a specific document.
 * The viewport children are not rendered when gated.
 * @param documentId Document ID.
 */
export const useIsViewportGated = (documentId: string) => {
  const { provides } = useViewportCapability();
  const isGated = ref(provides.value?.isGated(documentId) ?? false);

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (providesValue) {
        // Set initial state
        isGated.value = providesValue.isGated(documentId);
        const unsubscribe = providesValue.onGateChange((event: GateChangeEvent) => {
          // Filter by documentId
          if (event.documentId === documentId) {
            isGated.value = event.isGated;
          }
        });
        onCleanup(unsubscribe);
      }
    },
    { immediate: true },
  );

  return isGated;
};

/**
 * Hook to get scroll activity for a specific document
 * @param documentId Document ID.
 */
export const useViewportScrollActivity = (documentId: string) => {
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
          if (event.documentId === documentId) {
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
