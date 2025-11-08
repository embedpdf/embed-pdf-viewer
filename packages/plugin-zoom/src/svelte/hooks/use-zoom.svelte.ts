import { initialState, ZoomPlugin, ZoomState } from '@embedpdf/plugin-zoom';
import { useCapability, usePlugin } from '@embedpdf/core/svelte';

export const useZoomCapability = () => useCapability<ZoomPlugin>(ZoomPlugin.id);
export const useZoomPlugin = () => usePlugin<ZoomPlugin>(ZoomPlugin.id);

export const useZoom = () => {
  const capability = useZoomCapability();

  const state = $state({
    get provides() {
      return capability.provides;
    },
    state: initialState as ZoomState,
  });

  $effect(() => {
    if (!capability.provides) return;
    return capability.provides.onStateChange((newState) => {
      state.state = newState;
    });
  });

  return state;
};
