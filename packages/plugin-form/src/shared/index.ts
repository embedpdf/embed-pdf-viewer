import { createPluginPackage } from '@embedpdf/core';
import { FormPluginPackage as BaseFormPackage } from '@embedpdf/plugin-form';
import { FormRendererRegistration } from './components/form-renderer-registration';

export * from './hooks';
export * from './components';
export * from '@embedpdf/plugin-form';

export const FormPluginPackage = createPluginPackage(BaseFormPackage)
  .addUtility(FormRendererRegistration)
  .build();
