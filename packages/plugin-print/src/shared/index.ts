import { createPluginPackage } from '@embedpdf/core';
import { PrintPluginPackage as BasePrintPackage } from '@embedpdf/plugin-print';

import { PrintFrame } from './components';

export * from './hooks';
export * from './components';
export * from '@embedpdf/plugin-print';

export const PrintPluginPackage = createPluginPackage(BasePrintPackage)
  .addUtility(PrintFrame)
  .build();
