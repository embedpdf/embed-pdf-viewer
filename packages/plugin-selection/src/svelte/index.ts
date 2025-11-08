import { createPluginPackage } from '@embedpdf/core';
import { SelectionPluginPackage as BaseSelectionPluginPackage } from '@embedpdf/plugin-selection';

import { CopyToClipboard } from './components';

export * from './hooks';
export * from './components';
export * from '@embedpdf/plugin-selection';

export const SelectionPluginPackage = createPluginPackage(BaseSelectionPluginPackage)
  .addUtility(CopyToClipboard)
  .build();
