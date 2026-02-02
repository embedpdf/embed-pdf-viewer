import { createPluginPackage } from '@embedpdf/core';
import { RedactionPluginPackage as BaseRedactionPackage } from '@embedpdf/plugin-redaction';
import { RedactRendererRegistration } from './components';

export * from './hooks';
export * from './components';
export * from './components/types';
export * from '@embedpdf/plugin-redaction';

// Automatically register redact renderers when plugin is loaded
export const RedactionPluginPackage = createPluginPackage(BaseRedactionPackage)
  .addUtility(RedactRendererRegistration)
  .build();
