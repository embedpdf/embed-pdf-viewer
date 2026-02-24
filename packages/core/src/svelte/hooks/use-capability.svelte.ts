import type { BasePlugin } from '@embedpdf/core';
import { usePlugin } from './use-plugin.svelte.js';

/**
 * Hook to access a plugin's capability.
 * @param pluginId The ID of the plugin to access
 * @returns The capability provided by the plugin or null during initialization
 * @example
 * // Get zoom capability
 * const zoom = useCapability<ZoomPlugin>(ZoomPlugin.id);
 */
export function useCapability<T extends BasePlugin>(pluginId: T['id']) {
  const p = usePlugin<T>(pluginId);

  const state = $state({
    provides: null as ReturnType<NonNullable<T['provides']>> | null,
    isLoading: true,
    ready: new Promise<void>(() => {}),
  });

  // Use $effect to reactively update when plugin loads
  $effect(() => {
    if (!p.plugin) {
      state.provides = null;
      state.isLoading = p.isLoading;
      state.ready = p.ready;
      return;
    }

    if (!p.plugin.provides) {
      throw new Error(`Plugin ${pluginId} does not provide a capability`);
    }

    state.provides = p.plugin.provides() as ReturnType<NonNullable<T['provides']>>;
    state.isLoading = p.isLoading;
    state.ready = p.ready;
  });

  return state;
}
