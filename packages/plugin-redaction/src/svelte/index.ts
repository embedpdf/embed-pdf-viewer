import { createPluginPackage } from '@embedpdf/core';
import { RedactionPluginPackage as BaseRedactionPackage } from '@embedpdf/plugin-redaction';
import RedactRendererRegistration from './components/RedactRendererRegistration.svelte';

export * from './hooks';
export * from './components';
export * from './types';
export * from '@embedpdf/plugin-redaction';

export const RedactionPluginPackage = createPluginPackage(BaseRedactionPackage)
  .addUtility(RedactRendererRegistration)
  .build();
