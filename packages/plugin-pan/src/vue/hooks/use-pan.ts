import { ref, watch } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { PanPlugin } from '@embedpdf/plugin-pan';

export const usePanPlugin = () => usePlugin<PanPlugin>(PanPlugin.id);
export const usePanCapability = () => useCapability<PanPlugin>(PanPlugin.id);

export const usePan = () => {
  const { provides } = usePanCapability();
  const isPanning = ref(false);

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (providesValue) {
        const unsubscribe = providesValue.onPanModeChange((panning) => {
          isPanning.value = panning;
        });
        onCleanup(unsubscribe);
      }
    },
    { immediate: true },
  );

  return {
    provides,
    isPanning,
  };
};
