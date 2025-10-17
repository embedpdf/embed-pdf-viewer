import { TilingPlugin } from '@embedpdf/plugin-tiling';
import { useCapability, usePlugin } from '@embedpdf/core/svelte';

export const useTilingPlugin = () => usePlugin<TilingPlugin>(TilingPlugin.id);
export const useTilingCapability = () => useCapability<TilingPlugin>(TilingPlugin.id);
