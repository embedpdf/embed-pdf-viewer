import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { RotatePlugin } from '@embedpdf/plugin-rotate';
import { ref, watch } from 'vue';
import { Rotation } from '@embedpdf/models';

/**
 * Hook to get the raw rotate plugin instance.
 */
export const useRotatePlugin = () => usePlugin<RotatePlugin>(RotatePlugin.id);

/**
 * Hook to get the rotate plugin's capability API.
 * This provides methods for rotating the document.
 */
export const useRotateCapability = () => useCapability<RotatePlugin>(RotatePlugin.id);

/**
 * Hook that provides reactive rotation state and methods.
 */
export const useRotate = () => {
  const { provides } = useRotateCapability();
  const rotation = ref<Rotation>(0);

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (providesValue) {
        const unsubscribe = providesValue.onRotateChange((newRotation) => {
          rotation.value = newRotation;
        });
        onCleanup(unsubscribe);
      }
    },
    { immediate: true },
  );

  return {
    rotation,
    provides,
  };
};
