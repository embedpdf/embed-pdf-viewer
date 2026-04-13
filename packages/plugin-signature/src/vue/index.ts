import { createPluginPackage } from '@embedpdf/core';
import { SignaturePluginPackage as BaseSignaturePackage } from '@embedpdf/plugin-signature';

export * from './hooks';
export * from './components';
export * from '@embedpdf/plugin-signature';

export const SignaturePluginPackage = createPluginPackage(BaseSignaturePackage).build();
