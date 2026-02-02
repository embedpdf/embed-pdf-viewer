import { createPluginPackage } from '@embedpdf/core';
import { RedactionPluginPackage as BaseRedactionPackage } from '@embedpdf/plugin-redaction';
import { RedactRendererRegistration } from './components/redact-renderer-registration';

export * from './hooks';
export * from './components';
export * from '@embedpdf/plugin-redaction';

// Automatically register redact renderers when plugin is loaded
export const RedactionPluginPackage = createPluginPackage(BaseRedactionPackage)
  .addUtility(RedactRendererRegistration)
  .build();
