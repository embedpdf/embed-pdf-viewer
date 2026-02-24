import { ref, watch, toValue, type MaybeRefOrGetter } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { GateChangeEvent, ScrollActivity, ViewportPlugin } from '@embedpdf/plugin-viewport';

export const useViewportPlugin = () => usePlugin<ViewportPlugin>(ViewportPlugin.id);
export const useViewportCapability = () => useCapability<ViewportPlugin>(ViewportPlugin.id);

/**
 * Hook to get the gated state of the viewport for a specific document.
 * The viewport children are not rendered when gated.
 * @param documentId Document ID (can be ref, computed, getter, or plain value).
 */
export const useIsViewportGated = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = useViewportCapability();
  const isGated = ref(false);

  watch(
    [provides, () => toValue(documentId)],
    ([providesValue, docId], _, onCleanup) => {
      if (!providesValue) {
        isGated.value = false;
        return;
      }

      // Set initial state
      isGated.value = providesValue.isGated(docId);

      const unsubscribe = providesValue.onGateChange((event: GateChangeEvent) => {
        // Filter by documentId
        if (event.documentId === docId) {
          isGated.value = event.isGated;
        }
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return isGated;
};

/**
 * Hook to get scroll activity for a specific document
 * @param documentId Document ID (can be ref, computed, getter, or plain value).
 */
export const useViewportScrollActivity = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = useViewportCapability();
  const scrollActivity = ref<ScrollActivity>({
    isSmoothScrolling: false,
    isScrolling: false,
  });

  watch(
    [provides, () => toValue(documentId)],
    ([providesValue, docId], _, onCleanup) => {
      if (!providesValue) {
        scrollActivity.value = {
          isSmoothScrolling: false,
          isScrolling: false,
        };
        return;
      }

      const unsubscribe = providesValue.onScrollActivity((event) => {
        // Filter by documentId
        if (event.documentId === docId) {
          scrollActivity.value = event.activity;
        }
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return scrollActivity;
};
