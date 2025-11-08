import { ScrollCapability, ScrollPlugin } from '@embedpdf/plugin-scroll';
import { useCapability, usePlugin } from '@embedpdf/core/svelte';

export const useScrollPlugin = () => usePlugin<ScrollPlugin>(ScrollPlugin.id);
export const useScrollCapability = () => useCapability<ScrollPlugin>(ScrollPlugin.id);

export const useScroll = () => {
  const capability = useScrollCapability();

  const state = $state({
    get provides() {
      return capability.provides;
    },
    state: {
      currentPage: 1,
      totalPages: 1,
    },
  });

  $effect(() => {
    if (!capability.provides) return;
    return capability.provides.onPageChange(({ pageNumber, totalPages }) => {
      state.state.currentPage = pageNumber;
      state.state.totalPages = totalPages;
    });
  });

  return state;
};
