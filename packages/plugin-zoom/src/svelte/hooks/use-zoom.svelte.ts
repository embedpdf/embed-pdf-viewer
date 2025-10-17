import { initialState, ZoomPlugin, ZoomState } from '@embedpdf/plugin-zoom';
import { useCapability, usePlugin } from '@embedpdf/core/svelte';

export const useZoomCapability = () => useCapability<ZoomPlugin>(ZoomPlugin.id);
export const useZoomPlugin = () => usePlugin<ZoomPlugin>(ZoomPlugin.id);

export const useZoom = () => {
  const { provides } = $derived(useZoomCapability());
  let zoomState = $state<ZoomState>(initialState);

  $effect(() => {
    return provides?.onStateChange((action) => {
      zoomState = action;
    });
  });

  return {
    get state() {
      return zoomState;
    },
    get provides() {
      return provides;
    },
  };
};
