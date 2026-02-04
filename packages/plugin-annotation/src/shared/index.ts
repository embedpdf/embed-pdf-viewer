import { createPluginPackage } from '@embedpdf/core';
import { AnnotationPluginPackage as BaseAnnotationPackage } from '@embedpdf/plugin-annotation';
import { AnnotationRendererProvider } from './context/renderer-registry';

export * from './hooks';
export * from './components';
export * from './components/types';
export * from './context';
export * from '@embedpdf/plugin-annotation';

// Automatically wrap with AnnotationRendererProvider
export const AnnotationPluginPackage = createPluginPackage(BaseAnnotationPackage)
  .addWrapper(AnnotationRendererProvider)
  .build();
