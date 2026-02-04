import { createPluginPackage } from '@embedpdf/core';
import { AnnotationPluginPackage as BaseAnnotationPackage } from '@embedpdf/plugin-annotation';
import { RendererRegistryProvider } from './components';

export * from './hooks';
export * from './components';
export * from './types';
export * from './context';
export * from '@embedpdf/plugin-annotation';

// Automatically wrap with RendererRegistryProvider
export const AnnotationPluginPackage = createPluginPackage(BaseAnnotationPackage)
  .addWrapper(RendererRegistryProvider)
  .build();
