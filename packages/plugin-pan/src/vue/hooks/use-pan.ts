import { ref, onMounted, onUnmounted } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { PanPlugin } from '@embedpdf/plugin-pan';

export const usePanPlugin = () => usePlugin<PanPlugin>(PanPlugin.id);
export const usePanCapability = () => useCapability<PanPlugin>(PanPlugin.id);

export const usePan = () => {
  const { provides } = usePanCapability();
  const isPanning = ref(false);

  onMounted(() => {
    if (!provides.value) return;

    const unsubscribe = provides.value.onPanModeChange((panning) => {
      isPanning.value = panning;
    });

    onUnmounted(() => {
      unsubscribe();
    });
  });

  return {
    provides,
    isPanning,
  };
};
