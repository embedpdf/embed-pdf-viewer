import type { BasePlugin } from '@embedpdf/core';
import { pdfContext } from './use-registry.svelte.js';

/**
 * Hook to access a plugin.
 * @param pluginId The ID of the plugin to access
 * @returns The plugin or null during initialization
 * @example
 * // Get zoom plugin
 * const zoom = usePlugin<ZoomPlugin>(ZoomPlugin.id);
 */
export function usePlugin<T extends BasePlugin>(pluginId: T['id']) {
  const { registry } = pdfContext;

  const state = $state({
    plugin: null as T | null,
    isLoading: true,
    ready: new Promise<void>(() => {}),
  });

  if (registry === null) {
    return state;
  }

  const plugin = registry.getPlugin<T>(pluginId);

  if (!plugin) {
    throw new Error(`Plugin ${pluginId} not found`);
  }

  state.plugin = plugin;
  state.isLoading = false;
  state.ready = plugin.ready();

  return state;
}
