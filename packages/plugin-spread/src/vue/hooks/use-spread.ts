import { ref, watch } from 'vue';
import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { SpreadMode, SpreadPlugin } from '@embedpdf/plugin-spread';

export const useSpreadPlugin = () => usePlugin<SpreadPlugin>(SpreadPlugin.id);
export const useSpreadCapability = () => useCapability<SpreadPlugin>(SpreadPlugin.id);

export const useSpread = () => {
  const { provides } = useSpreadCapability();
  const spreadMode = ref<SpreadMode>(SpreadMode.None);

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (providesValue) {
        // Set initial spread mode
        spreadMode.value = providesValue.getSpreadMode();

        // Subscribe to spread mode changes
        const unsubscribe = providesValue.onSpreadChange((newSpreadMode) => {
          spreadMode.value = newSpreadMode;
        });

        onCleanup(unsubscribe);
      }
    },
    { immediate: true },
  );

  return {
    provides,
    spreadMode,
  };
};
