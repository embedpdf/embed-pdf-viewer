import type { BasePlugin } from '@embedpdf/core';
import { pdfContext } from './use-registry.svelte.js';

type PluginState<T extends BasePlugin> = {
  plugin: T | null;
  isLoading: boolean;
  ready: Promise<void>;
};

/**
 * Hook to access a plugin.
 * @param pluginId The ID of the plugin to access
 * @returns The plugin or null during initialization
 * @example
 * // Get zoom plugin
 * const zoom = usePlugin<ZoomPlugin>(ZoomPlugin.id);
 */
export function usePlugin<T extends BasePlugin>(pluginId: T['id']): PluginState<T> {
  const { registry } = pdfContext;
  if (registry === null) {
    return {
      plugin: null,
      isLoading: true,
      ready: new Promise(() => {})
    };
  }

  const plugin = registry.getPlugin<T>(pluginId);

  if (!plugin) {
    throw new Error(`Plugin ${pluginId} not found`);
  }

  return {
    plugin,
    isLoading: false,
    ready: plugin.ready()
  };
}
