import { ref, watch } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { ScrollActivity, ViewportPlugin } from '@embedpdf/plugin-viewport';

export const useViewportPlugin = () => usePlugin<ViewportPlugin>(ViewportPlugin.id);
export const useViewportCapability = () => useCapability<ViewportPlugin>(ViewportPlugin.id);

export const useViewportScrollActivity = () => {
  const { provides } = useViewportCapability();
  const scrollActivity = ref<ScrollActivity>({
    isSmoothScrolling: false,
    isScrolling: false,
  });

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (providesValue) {
        const unsubscribe = providesValue.onScrollActivity((activity) => {
          scrollActivity.value = activity;
        });
        onCleanup(unsubscribe);
      }
    },
    { immediate: true },
  );

  return scrollActivity;
};
