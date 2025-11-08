import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { FullscreenPlugin, FullscreenState, initialState } from '@embedpdf/plugin-fullscreen';

export const useFullscreenPlugin = () => usePlugin<FullscreenPlugin>(FullscreenPlugin.id);
export const useFullscreenCapability = () => useCapability<FullscreenPlugin>(FullscreenPlugin.id);

export const useFullscreen = () => {
  const capability = useFullscreenCapability();

  const state = $state({
    get provides() {
      return capability.provides;
    },
    state: initialState as FullscreenState,
  });

  $effect(() => {
    if (!capability.provides) return;
    return capability.provides.onStateChange((newState) => {
      state.state = newState;
    });
  });

  return state;
};
