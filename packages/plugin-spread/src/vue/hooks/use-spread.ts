import { ref, watchEffect, onUnmounted } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { SpreadMode, SpreadPlugin } from '@embedpdf/plugin-spread';

export const useSpreadPlugin = () => usePlugin<SpreadPlugin>(SpreadPlugin.id);
export const useSpreadCapability = () => useCapability<SpreadPlugin>(SpreadPlugin.id);

export const useSpread = () => {
  const { provides: spreadProviderRef } = useSpreadCapability();
  const spreadMode = ref<SpreadMode>(SpreadMode.None);

  let unsubscribe: (() => void) | null = null;

  watchEffect(() => {
    const spreadProvider = spreadProviderRef.value;

    // Clean up previous subscription if it exists
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    if (spreadProvider) {
      // Set initial spread mode
      spreadMode.value = spreadProvider.getSpreadMode();

      // Subscribe to spread mode changes
      unsubscribe = spreadProvider.onSpreadChange((newSpreadMode) => {
        spreadMode.value = newSpreadMode;
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
    provides: spreadProviderRef,
    spreadMode,
  };
};
