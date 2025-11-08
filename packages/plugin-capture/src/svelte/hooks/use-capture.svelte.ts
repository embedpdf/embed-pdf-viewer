import { CapturePlugin } from '@embedpdf/plugin-capture';
import { useCapability, usePlugin } from '@embedpdf/core/svelte';

export const useCaptureCapability = () => useCapability<CapturePlugin>(CapturePlugin.id);
export const useCapturePlugin = () => usePlugin<CapturePlugin>(CapturePlugin.id);

export const useCapture = () => {
  const capability = useCaptureCapability();

  const state = $state({
    get provides() {
      return capability.provides;
    },
    isMarqueeCaptureActive: false,
  });

  $effect(() => {
    return capability.provides?.onMarqueeCaptureActiveChange((active) => {
      state.isMarqueeCaptureActive = active;
    });
  });

  return state;
};
