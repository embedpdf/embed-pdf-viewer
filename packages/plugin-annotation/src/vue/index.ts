import { createPluginPackage } from '@embedpdf/core';
import { AnnotationPluginPackage as BaseAnnotationPackage } from '@embedpdf/plugin-annotation';
import { RendererRegistryProvider } from './components';
import AnnotationNavigationHandler from './components/annotation-navigation-handler.vue';

export * from './hooks';
export * from './components';
export * from './types';
export * from './context';
export * from '@embedpdf/plugin-annotation';

export const AnnotationPluginPackage = createPluginPackage(BaseAnnotationPackage)
  .addWrapper(RendererRegistryProvider)
  .addUtility(AnnotationNavigationHandler)
  .build();
