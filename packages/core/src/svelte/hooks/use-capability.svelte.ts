import type { BasePlugin } from '@embedpdf/core';
import { usePlugin } from './use-plugin.svelte.js';

type CapabilityState<T extends BasePlugin> = {
  provides: ReturnType<NonNullable<T['provides']>> | null;
  isLoading: boolean;
  ready: Promise<void>;
};

/**
 * Hook to access a plugin's capability.
 * @param pluginId The ID of the plugin to access
 * @returns The capability provided by the plugin or null during initialization
 * @example
 * // Get zoom capability
 * const zoom = useCapability<ZoomPlugin>(ZoomPlugin.id);
 */
export function useCapability<T extends BasePlugin>(pluginId: T['id']): CapabilityState<T> {
  const p = usePlugin<T>(pluginId);

  if (!p.plugin) {
    return {
      provides: null,
      isLoading: p.isLoading,
      ready: p.ready
    };
  }

  if (!p.plugin.provides) {
    throw new Error(`Plugin ${pluginId} does not provide a capability`);
  }

  return {
    provides: p.plugin.provides() as ReturnType<NonNullable<T['provides']>>,
    isLoading: p.isLoading,
    ready: p.ready
  };
}
