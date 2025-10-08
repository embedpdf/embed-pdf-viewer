import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { CapturePlugin } from '@embedpdf/plugin-capture';
import { ref, watch } from 'vue';

export const useCaptureCapability = () => useCapability<CapturePlugin>(CapturePlugin.id);
export const useCapturePlugin = () => usePlugin<CapturePlugin>(CapturePlugin.id);

export const useCapture = () => {
  const { provides } = useCaptureCapability();
  const isMarqueeCaptureActive = ref(false);

  watch(
    provides,
    (providesValue, _, onCleanup) => {
      if (providesValue) {
        const unsubscribe = providesValue.onMarqueeCaptureActiveChange((active) => {
          isMarqueeCaptureActive.value = active;
        });
        onCleanup(unsubscribe);
      }
    },
    { immediate: true },
  );

  return {
    provides,
    isMarqueeCaptureActive,
  };
};
