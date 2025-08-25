import { ref, watchEffect, onUnmounted } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { FullscreenPlugin, FullscreenState, initialState } from '@embedpdf/plugin-fullscreen';

export const useFullscreenPlugin = () => usePlugin<FullscreenPlugin>(FullscreenPlugin.id);
export const useFullscreenCapability = () => useCapability<FullscreenPlugin>(FullscreenPlugin.id);

export const useFullscreen = () => {
  const { provides: fullscreenProviderRef } = useFullscreenCapability();
  const state = ref<FullscreenState>(initialState);

  let unsubscribe: (() => void) | null = null;

  watchEffect(() => {
    const fullscreenProvider = fullscreenProviderRef.value;

    // Clean up previous subscription if it exists
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    if (fullscreenProvider) {
      // Subscribe to state changes
      unsubscribe = fullscreenProvider.onStateChange((newState) => {
        state.value = newState;
      });
    }
  });

  // Clean up on unmount
  onUnmounted(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  return {
    provides: fullscreenProviderRef,
    state,
  };
};
