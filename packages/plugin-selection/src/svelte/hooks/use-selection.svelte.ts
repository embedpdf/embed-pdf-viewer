import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { SelectionPlugin } from '@embedpdf/plugin-selection';

/**
 * Hook to get the selection plugin's capability API.
 * This provides methods for controlling and listening to selection events.
 */
export const useSelectionCapability = () => useCapability<SelectionPlugin>(SelectionPlugin.id);

/**
 * Hook to get the raw selection plugin instance.
 * Useful for accessing plugin-specific properties or methods not exposed in the capability.
 */
export const useSelectionPlugin = () => usePlugin<SelectionPlugin>(SelectionPlugin.id);
