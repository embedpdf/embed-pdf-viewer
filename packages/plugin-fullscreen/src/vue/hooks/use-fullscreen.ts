import { ref, watchEffect } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { FullscreenPlugin, FullscreenState, initialState } from '@embedpdf/plugin-fullscreen';

export const useFullscreenPlugin = () => usePlugin<FullscreenPlugin>(FullscreenPlugin.id);
export const useFullscreenCapability = () => useCapability<FullscreenPlugin>(FullscreenPlugin.id);

export const useFullscreen = () => {
  const { provides: fullscreenProviderRef } = useFullscreenCapability();
  const state = ref<FullscreenState>(initialState);

  watchEffect((onCleanup) => {
    const fullscreenProvider = fullscreenProviderRef.value;

    if (fullscreenProvider) {
      const unsubscribe = fullscreenProvider.onStateChange((newState) => {
        state.value = newState;
      });

      onCleanup(() => {
        unsubscribe();
      });
    }
  });

  return {
    provides: fullscreenProviderRef,
    state,
  };
};
