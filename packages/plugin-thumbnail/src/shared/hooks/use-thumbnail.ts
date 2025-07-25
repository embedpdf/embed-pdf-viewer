import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { ThumbnailPlugin } from '@embedpdf/plugin-thumbnail';

export const useThumbnailPlugin = () => usePlugin<ThumbnailPlugin>(ThumbnailPlugin.id);
export const useThumbnailCapability = () => useCapability<ThumbnailPlugin>(ThumbnailPlugin.id);
