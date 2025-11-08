import { createPluginPackage } from '@embedpdf/core';
import { FullscreenPluginPackage as BaseFullscreenPackage } from '@embedpdf/plugin-fullscreen';
import { FullscreenProvider } from './components';

export * from './hooks';
export * from './components';

export * from '@embedpdf/plugin-fullscreen';

export const FullscreenPluginPackage = createPluginPackage(BaseFullscreenPackage)
  .addWrapper(FullscreenProvider)
  .build();
