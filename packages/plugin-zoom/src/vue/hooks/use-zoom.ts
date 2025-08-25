import { ref, onMounted, onUnmounted } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { initialState, ZoomPlugin, ZoomState } from '@embedpdf/plugin-zoom';

export const useZoomCapability = () => useCapability<ZoomPlugin>(ZoomPlugin.id);
export const useZoomPlugin = () => usePlugin<ZoomPlugin>(ZoomPlugin.id);

export const useZoom = () => {
  const { provides } = useZoomCapability();
  const state = ref<ZoomState>(initialState);

  onMounted(() => {
    if (!provides.value) return;

    const unsubscribe = provides.value.onStateChange((newState) => {
      state.value = newState;
    });

    onUnmounted(() => {
      unsubscribe();
    });
  });

  return {
    state,
    provides,
  };
};
