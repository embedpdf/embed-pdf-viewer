import { createPluginPackage } from '@embedpdf/core';
import { LoaderPluginPackage as BaseLoaderPackage } from '@embedpdf/plugin-loader';

import { FilePicker } from './components';

export * from './hooks';
export * from './components';
export * from '@embedpdf/plugin-loader';

export const LoaderPluginPackage = createPluginPackage(BaseLoaderPackage)
  .addUtility(FilePicker)
  .build();
