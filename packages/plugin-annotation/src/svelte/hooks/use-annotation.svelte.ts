import { AnnotationPlugin, initialState } from '@embedpdf/plugin-annotation';
import { useCapability, usePlugin } from '@embedpdf/core/svelte';

export const useAnnotationCapability = () => useCapability<AnnotationPlugin>(AnnotationPlugin.id);
export const useAnnotationPlugin = () => usePlugin<AnnotationPlugin>(AnnotationPlugin.id);

export const useAnnotation = () => {
  const capability = useAnnotationCapability();

  const state = $state({
    get provides() {
      return capability.provides;
    },
    state: initialState({ enabled: true }),
  });

  $effect(() => {
    if (!capability.provides) return;
    return capability.provides.onStateChange((newState) => {
      state.state = newState;
    });
  });

  return state;
};
