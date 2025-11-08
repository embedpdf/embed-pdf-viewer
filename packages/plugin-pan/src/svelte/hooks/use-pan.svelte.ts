import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { PanPlugin } from '@embedpdf/plugin-pan';

export const usePanPlugin = () => usePlugin<PanPlugin>(PanPlugin.id);
export const usePanCapability = () => useCapability<PanPlugin>(PanPlugin.id);

export const usePan = () => {
  const capability = usePanCapability();

  const state = $state({
    get provides() {
      return capability.provides;
    },
    isPanning: false,
  });

  $effect(() => {
    if (!capability.provides) return;
    return capability.provides.onPanModeChange((isPanningState) => {
      state.isPanning = isPanningState;
    });
  });

  return state;
};
