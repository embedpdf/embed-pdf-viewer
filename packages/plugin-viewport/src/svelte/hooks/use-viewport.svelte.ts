import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { ScrollActivity, ViewportPlugin } from '@embedpdf/plugin-viewport';

export const useViewportPlugin = () => usePlugin<ViewportPlugin>(ViewportPlugin.id);
export const useViewportCapability = () => useCapability<ViewportPlugin>(ViewportPlugin.id);

export const useViewportScrollActivity = () => {
  const capability = useViewportCapability();

  const state = $state({
    isScrolling: false,
    isSmoothScrolling: false,
  });

  $effect(() => {
    if (!capability.provides) return;

    return capability.provides.onScrollActivity((activity: ScrollActivity) => {
      state.isScrolling = activity.isScrolling;
      state.isSmoothScrolling = activity.isSmoothScrolling;
    });
  });

  return state;
};
