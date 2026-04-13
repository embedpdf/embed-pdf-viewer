import { createPluginPackage } from '@embedpdf/core';
import { FormPluginPackage as BaseFormPluginPackage } from '@embedpdf/plugin-form';
import FormRendererRegistration from './components/form-renderer-registration.vue';

export * from './hooks';

export * from '@embedpdf/plugin-form';

export const FormPluginPackage = createPluginPackage(BaseFormPluginPackage)
  .addUtility(FormRendererRegistration)
  .build();
