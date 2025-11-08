import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { initialState, SearchPlugin, SearchState } from '@embedpdf/plugin-search';

export const useSearchPlugin = () => usePlugin<SearchPlugin>(SearchPlugin.id);
export const useSearchCapability = () => useCapability<SearchPlugin>(SearchPlugin.id);

export const useSearch = () => {
  const capability = useSearchCapability();

  const state = $state({
    get provides() {
      return capability.provides;
    },
    state: initialState as SearchState,
  });

  $effect(() => {
    if (!capability.provides) return;
    return capability.provides.onStateChange((newState) => {
      state.state = newState;
    });
  });

  return state;
};
