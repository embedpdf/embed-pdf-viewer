import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { SpreadMode, SpreadPlugin } from '@embedpdf/plugin-spread';

/**
 * Hook to get the spread plugin's capability API.
 * This provides methods for controlling spread mode.
 */
export const useSpreadCapability = () => useCapability<SpreadPlugin>(SpreadPlugin.id);

/**
 * Hook to get the raw spread plugin instance.
 * Useful for accessing plugin-specific properties or methods not exposed in the capability.
 */
export const useSpreadPlugin = () => usePlugin<SpreadPlugin>(SpreadPlugin.id);

/**
 * Hook to manage spread mode state and listen to changes.
 * Returns the capability provider and reactive spread mode.
 */
export const useSpread = () => {
  const capability = useSpreadCapability();

  const state = $state({
    get provides() {
      return capability.provides;
    },
    spreadMode: SpreadMode.None as SpreadMode,
  });

  $effect(() => {
    if (!capability.provides) return;

    // Set initial spread mode
    state.spreadMode = capability.provides.getSpreadMode();

    // Subscribe to spread mode changes
    const unsubscribe = capability.provides.onSpreadChange((newSpreadMode) => {
      state.spreadMode = newSpreadMode;
    });

    return unsubscribe;
  });

  return state;
};
